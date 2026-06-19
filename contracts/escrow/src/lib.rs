#![no_std]
//! Earmark Escrow
//!
//! The core of conditional remittances. A sender deposits USDC and attaches a condition;
//! the funds sit in this contract — not with the sender, not with the recipient, not with
//! Earmark — until one of three things happens:
//!
//!   * **Release**  — the condition is `Confirmed` in the attestation contract, so anyone
//!     can settle the earmark, pushing USDC to the recipient (conditional mode) or straight
//!     to a verified institution's payout address (direct-to-purpose mode).
//!   * **Refund**   — the condition is `Rejected`, or the earmark's expiry has passed, so
//!     the sender can pull their funds back. This is the dispute / fallback path.
//!
//! USDC moves via the standard token interface, so on testnet/mainnet this is the real
//! USDC Stellar Asset Contract; in unit tests it's a Soroban test SAC.
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short,
    token, Address, Env, IntoVal, String, Symbol, Val, Vec,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Earmark(u64),
    SenderEarmarks(Address),
    RecipientEarmarks(Address),
    NextId,
    Config,
    Initialized,
}

#[derive(Clone)]
#[contracttype]
pub struct Config {
    pub admin: Address,
    /// USDC Stellar Asset Contract address.
    pub token: Address,
    pub registry: Address,
    pub attestation: Address,
}

/// Where confirmed funds go.
#[derive(Clone, Copy, Debug, PartialEq)]
#[contracttype]
pub enum ReleaseMode {
    /// Release to the recipient's own wallet once the condition is confirmed.
    ConditionalRecipient,
    /// Release straight to a verified institution's payout address (school, clinic, …).
    DirectInstitution,
}

#[derive(Clone, Copy, Debug, PartialEq)]
#[contracttype]
pub enum EarmarkStatus {
    Active,
    Released,
    Refunded,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Earmark {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub mode: ReleaseMode,
    /// Institution id for `DirectInstitution`; 0 (unused) for `ConditionalRecipient`.
    pub institution_id: u64,
    pub amount: i128,
    pub purpose: String,
    pub status: EarmarkStatus,
    pub created_at: u64,
    /// After this timestamp the sender may unilaterally refund.
    pub expiry: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum EscrowError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    NotFound = 5,
    NotActive = 6,
    NotConfirmed = 7,
    InstitutionNotVerified = 8,
    RefundNotAllowed = 9,
    InvalidExpiry = 10,
    PurposeTooLong = 11,
}

const LEDGER_BUMP: u32 = 120960;
const LEDGER_THRESHOLD: u32 = 103680;

// ── Cross-contract read helpers ────────────────────────────────────────────────

fn registry_is_verified(env: &Env, registry: &Address, id: u64) -> bool {
    let args: Vec<Val> = soroban_sdk::vec![env, id.into_val(env)];
    env.invoke_contract(registry, &Symbol::new(env, "is_verified"), args)
}

fn registry_payout(env: &Env, registry: &Address, id: u64) -> Address {
    let args: Vec<Val> = soroban_sdk::vec![env, id.into_val(env)];
    env.invoke_contract(registry, &Symbol::new(env, "institution_payout"), args)
}

fn attest_is_confirmed(env: &Env, attestation: &Address, earmark_id: u64) -> bool {
    let args: Vec<Val> = soroban_sdk::vec![env, earmark_id.into_val(env)];
    env.invoke_contract(attestation, &Symbol::new(env, "is_confirmed"), args)
}

fn attest_is_rejected(env: &Env, attestation: &Address, earmark_id: u64) -> bool {
    let args: Vec<Val> = soroban_sdk::vec![env, earmark_id.into_val(env)];
    env.invoke_contract(attestation, &Symbol::new(env, "is_rejected"), args)
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        registry: Address,
        attestation: Address,
    ) -> Result<(), EscrowError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(EscrowError::AlreadyInitialized);
        }
        admin.require_auth();
        let config = Config { admin, token, registry, attestation };
        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::NextId, &1u64);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
        Ok(())
    }

    /// Deposit `amount` of USDC and create an earmark. Funds are pulled from the sender
    /// into this contract immediately, so the commitment is real the moment it's made.
    pub fn create_earmark(
        env: Env,
        sender: Address,
        recipient: Address,
        mode: ReleaseMode,
        institution_id: u64,
        amount: i128,
        purpose: String,
        expiry: u64,
    ) -> Result<u64, EscrowError> {
        sender.require_auth();
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        if expiry <= env.ledger().timestamp() {
            return Err(EscrowError::InvalidExpiry);
        }
        if purpose.len() > 100 {
            return Err(EscrowError::PurposeTooLong);
        }
        let config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(EscrowError::NotInitialized)?;

        // Direct-to-purpose payouts may only target a *verified* institution.
        if mode == ReleaseMode::DirectInstitution
            && !registry_is_verified(&env, &config.registry, institution_id)
        {
            return Err(EscrowError::InstitutionNotVerified);
        }

        // Pull USDC from the sender into escrow.
        let token_client = token::Client::new(&env, &config.token);
        token_client.transfer(&sender, &env.current_contract_address(), &amount);

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
        let earmark = Earmark {
            id,
            sender: sender.clone(),
            recipient: recipient.clone(),
            mode,
            institution_id,
            amount,
            purpose,
            status: EarmarkStatus::Active,
            created_at: env.ledger().timestamp(),
            expiry,
        };
        env.storage().persistent().set(&DataKey::Earmark(id), &earmark);
        env.storage().persistent().extend_ttl(&DataKey::Earmark(id), LEDGER_THRESHOLD, LEDGER_BUMP);

        Self::index_push(&env, DataKey::SenderEarmarks(sender.clone()), id);
        Self::index_push(&env, DataKey::RecipientEarmarks(recipient.clone()), id);

        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish(
            (symbol_short!("created"), sender, recipient),
            (id, amount),
        );
        Ok(id)
    }

    /// Settle a confirmed earmark. Permissionless: once the attestation says `Confirmed`,
    /// anyone (the recipient, the sender, or a keeper) can trigger the payout — it can only
    /// go to the predetermined destination, so there's nothing to game.
    pub fn release(env: Env, earmark_id: u64) -> Result<(), EscrowError> {
        let mut earmark: Earmark = env
            .storage()
            .persistent()
            .get(&DataKey::Earmark(earmark_id))
            .ok_or(EscrowError::NotFound)?;
        if earmark.status != EarmarkStatus::Active {
            return Err(EscrowError::NotActive);
        }
        let config: Config = env.storage().instance().get(&DataKey::Config).unwrap();
        if !attest_is_confirmed(&env, &config.attestation, earmark_id) {
            return Err(EscrowError::NotConfirmed);
        }

        let destination = match earmark.mode {
            ReleaseMode::ConditionalRecipient => earmark.recipient.clone(),
            ReleaseMode::DirectInstitution => {
                registry_payout(&env, &config.registry, earmark.institution_id)
            }
        };

        let token_client = token::Client::new(&env, &config.token);
        token_client.transfer(
            &env.current_contract_address(),
            &destination,
            &earmark.amount,
        );

        earmark.status = EarmarkStatus::Released;
        env.storage().persistent().set(&DataKey::Earmark(earmark_id), &earmark);
        env.events().publish(
            (symbol_short!("released"), destination),
            (earmark_id, earmark.amount),
        );
        Ok(())
    }

    /// Return funds to the sender. Allowed when the condition was explicitly `Rejected`,
    /// or once the earmark's expiry has passed. Sender must sign.
    pub fn refund(env: Env, earmark_id: u64) -> Result<(), EscrowError> {
        let mut earmark: Earmark = env
            .storage()
            .persistent()
            .get(&DataKey::Earmark(earmark_id))
            .ok_or(EscrowError::NotFound)?;
        if earmark.status != EarmarkStatus::Active {
            return Err(EscrowError::NotActive);
        }
        earmark.sender.require_auth();

        let config: Config = env.storage().instance().get(&DataKey::Config).unwrap();
        let rejected = attest_is_rejected(&env, &config.attestation, earmark_id);
        let expired = env.ledger().timestamp() >= earmark.expiry;
        if !rejected && !expired {
            return Err(EscrowError::RefundNotAllowed);
        }

        let token_client = token::Client::new(&env, &config.token);
        token_client.transfer(
            &env.current_contract_address(),
            &earmark.sender,
            &earmark.amount,
        );

        earmark.status = EarmarkStatus::Refunded;
        env.storage().persistent().set(&DataKey::Earmark(earmark_id), &earmark);
        env.events().publish(
            (symbol_short!("refunded"), earmark.sender.clone()),
            (earmark_id, earmark.amount),
        );
        Ok(())
    }

    // ── Views ──────────────────────────────────────────────────────────────────

    pub fn get_earmark(env: Env, earmark_id: u64) -> Result<Earmark, EscrowError> {
        env.storage()
            .persistent()
            .get(&DataKey::Earmark(earmark_id))
            .ok_or(EscrowError::NotFound)
    }

    pub fn get_sender_earmarks(env: Env, sender: Address) -> Vec<Earmark> {
        Self::collect(&env, DataKey::SenderEarmarks(sender))
    }

    pub fn get_recipient_earmarks(env: Env, recipient: Address) -> Vec<Earmark> {
        Self::collect(&env, DataKey::RecipientEarmarks(recipient))
    }

    pub fn config(env: Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    fn index_push(env: &Env, key: DataKey, id: u64) {
        let mut list: Vec<u64> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env));
        list.push_back(id);
        env.storage().persistent().set(&key, &list);
        env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    fn collect(env: &Env, key: DataKey) -> Vec<Earmark> {
        let ids: Vec<u64> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Vec::new(env));
        let mut out: Vec<Earmark> = Vec::new(env);
        for id in ids.iter() {
            if let Some(e) = env.storage().persistent().get::<_, Earmark>(&DataKey::Earmark(id)) {
                out.push_back(e);
            }
        }
        out
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use earmark_attestation::{AttestationContract, AttestationContractClient, AttestStatus};
    use earmark_registry::{Category, RegistryContract, RegistryContractClient};
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token::{StellarAssetClient, TokenClient},
        Address, Env, String,
    };

    struct World {
        env: Env,
        admin: Address,
        token: TokenClient<'static>,
        token_admin: StellarAssetClient<'static>,
        registry: RegistryContractClient<'static>,
        attest: AttestationContractClient<'static>,
        escrow: EscrowContractClient<'static>,
    }

    fn setup() -> World {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);
        let admin = Address::generate(&env);

        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = sac.address();

        let reg_id = env.register_contract(None, RegistryContract);
        let att_id = env.register_contract(None, AttestationContract);
        let esc_id = env.register_contract(None, EscrowContract);

        let registry = RegistryContractClient::new(&env, &reg_id);
        let attest = AttestationContractClient::new(&env, &att_id);
        let escrow = EscrowContractClient::new(&env, &esc_id);

        registry.initialize(&admin);
        attest.initialize(&admin);
        escrow.initialize(&admin, &token_id, &reg_id, &att_id);

        World {
            env: env.clone(),
            admin,
            token: TokenClient::new(&env, &token_id),
            token_admin: StellarAssetClient::new(&env, &token_id),
            registry,
            attest,
            escrow,
        }
    }

    fn fund(w: &World, who: &Address, amount: &i128) {
        w.token_admin.mint(who, amount);
    }

    #[test]
    fn test_conditional_release_to_recipient() {
        let w = setup();
        let sender = Address::generate(&w.env);
        let recipient = Address::generate(&w.env);
        fund(&w, &sender, &1_000_0000000);

        let id = w.escrow.create_earmark(
            &sender,
            &recipient,
            &ReleaseMode::ConditionalRecipient,
            &0u64,
            &500_0000000,
            &String::from_str(&w.env, "Rent June"),
            &(w.env.ledger().timestamp() + 86_400),
        );

        // Escrow now holds the funds; sender has been debited.
        assert_eq!(w.token.balance(&sender), 500_0000000);
        assert_eq!(w.token.balance(&w.escrow.address), 500_0000000);

        // Cannot release before the condition is confirmed.
        assert!(w.escrow.try_release(&id).is_err());

        // Bursar/oracle confirms.
        w.attest.attest(&w.admin, &id, &AttestStatus::Confirmed, &String::from_str(&w.env, "paid"));
        w.escrow.release(&id);

        assert_eq!(w.token.balance(&recipient), 500_0000000);
        assert_eq!(w.token.balance(&w.escrow.address), 0);
        assert_eq!(w.escrow.get_earmark(&id).status, EarmarkStatus::Released);
    }

    #[test]
    fn test_direct_to_verified_institution() {
        let w = setup();
        let sender = Address::generate(&w.env);
        let recipient = Address::generate(&w.env);
        let school_payout = Address::generate(&w.env);
        fund(&w, &sender, &1_000_0000000);

        let inst = w.registry.add_institution(
            &String::from_str(&w.env, "Unity School"),
            &Category::School,
            &school_payout,
        );
        w.registry.set_verified(&inst, &true);

        let id = w.escrow.create_earmark(
            &sender,
            &recipient,
            &ReleaseMode::DirectInstitution,
            &inst,
            &300_0000000,
            &String::from_str(&w.env, "Tuition"),
            &(w.env.ledger().timestamp() + 86_400),
        );
        w.attest.attest(&w.admin, &id, &AttestStatus::Confirmed, &String::from_str(&w.env, "enrolled"));
        w.escrow.release(&id);

        // Funds went to the school's payout address, not the recipient.
        assert_eq!(w.token.balance(&school_payout), 300_0000000);
        assert_eq!(w.token.balance(&recipient), 0);
    }

    #[test]
    fn test_direct_to_unverified_institution_fails() {
        let w = setup();
        let sender = Address::generate(&w.env);
        let recipient = Address::generate(&w.env);
        let payout = Address::generate(&w.env);
        fund(&w, &sender, &1_000_0000000);

        let inst = w.registry.add_institution(
            &String::from_str(&w.env, "Sketchy Co"),
            &Category::Merchant,
            &payout,
        );
        // Not verified — creating a direct earmark must fail.
        let r = w.escrow.try_create_earmark(
            &sender,
            &recipient,
            &ReleaseMode::DirectInstitution,
            &inst,
            &100_0000000,
            &String::from_str(&w.env, "x"),
            &(w.env.ledger().timestamp() + 86_400),
        );
        assert!(r.is_err());
        // Sender keeps their money.
        assert_eq!(w.token.balance(&sender), 1_000_0000000);
    }

    #[test]
    fn test_refund_after_rejection() {
        let w = setup();
        let sender = Address::generate(&w.env);
        let recipient = Address::generate(&w.env);
        fund(&w, &sender, &1_000_0000000);

        let id = w.escrow.create_earmark(
            &sender,
            &recipient,
            &ReleaseMode::ConditionalRecipient,
            &0u64,
            &400_0000000,
            &String::from_str(&w.env, "Fees"),
            &(w.env.ledger().timestamp() + 86_400),
        );
        w.attest.attest(&w.admin, &id, &AttestStatus::Rejected, &String::from_str(&w.env, "no enrollment"));

        // Cannot release a rejected earmark.
        assert!(w.escrow.try_release(&id).is_err());
        // Sender refunds.
        w.escrow.refund(&id);
        assert_eq!(w.token.balance(&sender), 1_000_0000000);
        assert_eq!(w.escrow.get_earmark(&id).status, EarmarkStatus::Refunded);
    }

    #[test]
    fn test_refund_after_expiry() {
        let w = setup();
        let sender = Address::generate(&w.env);
        let recipient = Address::generate(&w.env);
        fund(&w, &sender, &1_000_0000000);

        let expiry = w.env.ledger().timestamp() + 3600;
        let id = w.escrow.create_earmark(
            &sender,
            &recipient,
            &ReleaseMode::ConditionalRecipient,
            &0u64,
            &200_0000000,
            &String::from_str(&w.env, "Medicine"),
            &expiry,
        );
        // Before expiry, with no rejection, refund is blocked.
        assert!(w.escrow.try_refund(&id).is_err());
        // Jump past expiry.
        w.env.ledger().with_mut(|l| l.timestamp = expiry + 1);
        w.escrow.refund(&id);
        assert_eq!(w.token.balance(&sender), 1_000_0000000);
    }

    #[test]
    fn test_cannot_release_twice() {
        let w = setup();
        let sender = Address::generate(&w.env);
        let recipient = Address::generate(&w.env);
        fund(&w, &sender, &1_000_0000000);
        let id = w.escrow.create_earmark(
            &sender,
            &recipient,
            &ReleaseMode::ConditionalRecipient,
            &0u64,
            &100_0000000,
            &String::from_str(&w.env, "x"),
            &(w.env.ledger().timestamp() + 86_400),
        );
        w.attest.attest(&w.admin, &id, &AttestStatus::Confirmed, &String::from_str(&w.env, "ok"));
        w.escrow.release(&id);
        assert!(w.escrow.try_release(&id).is_err());
    }

    #[test]
    fn test_indexing_by_sender_and_recipient() {
        let w = setup();
        let sender = Address::generate(&w.env);
        let recipient = Address::generate(&w.env);
        fund(&w, &sender, &1_000_0000000);
        w.escrow.create_earmark(
            &sender, &recipient, &ReleaseMode::ConditionalRecipient, &0u64,
            &100_0000000, &String::from_str(&w.env, "a"), &(w.env.ledger().timestamp() + 86_400),
        );
        w.escrow.create_earmark(
            &sender, &recipient, &ReleaseMode::ConditionalRecipient, &0u64,
            &50_0000000, &String::from_str(&w.env, "b"), &(w.env.ledger().timestamp() + 86_400),
        );
        assert_eq!(w.escrow.get_sender_earmarks(&sender).len(), 2);
        assert_eq!(w.escrow.get_recipient_earmarks(&recipient).len(), 2);
    }

    #[test]
    fn test_zero_amount_rejected() {
        let w = setup();
        let sender = Address::generate(&w.env);
        let recipient = Address::generate(&w.env);
        let r = w.escrow.try_create_earmark(
            &sender, &recipient, &ReleaseMode::ConditionalRecipient, &0u64,
            &0i128, &String::from_str(&w.env, "x"), &(w.env.ledger().timestamp() + 86_400),
        );
        assert!(r.is_err());
    }
}

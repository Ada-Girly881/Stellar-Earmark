#![no_std]
//! Earmark Registry
//!
//! Two things live here:
//!   1. **User profiles** — senders and recipients opt in with a display name and a role.
//!   2. **Verified institutions** — schools, clinics, landlords, utilities and merchants
//!      that funds can be routed to. Verification is the moat: only an admin can mark an
//!      institution as verified, and escrow refuses direct-to-purpose payouts to anything
//!      that isn't. Each institution carries a payout address (where USDC lands) so the
//!      escrow contract can resolve it at release time.
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short,
    Address, Env, String, Vec,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    UserProfile(Address),
    Institution(u64),
    InstitutionList,
    NextInstitutionId,
    Admin,
    Initialized,
}

/// Whether a user signs up to send money or to receive it. Purely informational —
/// the chain doesn't gate behaviour on it, the UI does.
#[derive(Clone, Copy, Debug, PartialEq)]
#[contracttype]
pub enum Role {
    Sender,
    Recipient,
}

/// The kind of purpose an institution serves. Drives UI grouping and lets a sender
/// say "route this to a clinic" without hard-coding an address.
#[derive(Clone, Copy, Debug, PartialEq)]
#[contracttype]
pub enum Category {
    School,
    Clinic,
    Landlord,
    Utility,
    Merchant,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct UserProfile {
    pub address: Address,
    pub name: String,
    pub role: Role,
    pub registered_at: u64,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Institution {
    pub id: u64,
    /// Where released USDC is sent for direct-to-purpose earmarks.
    pub payout: Address,
    pub name: String,
    pub category: Category,
    /// The address allowed to attest conditions on this institution's behalf
    /// (e.g. the school's bursar key). Defaults to `payout` at registration.
    pub attestor: Address,
    pub verified: bool,
    pub registered_at: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum RegistryError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    AlreadyRegistered = 4,
    UserNotFound = 5,
    InvalidName = 6,
    InstitutionNotFound = 7,
}

// ~7 days at 5s/ledger
const LEDGER_BUMP: u32 = 120960;
const LEDGER_THRESHOLD: u32 = 103680;

#[contract]
pub struct RegistryContract;

#[contractimpl]
impl RegistryContract {
    pub fn initialize(env: Env, admin: Address) -> Result<(), RegistryError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(RegistryError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::NextInstitutionId, &1u64);
        env.storage().instance().set(&DataKey::InstitutionList, &Vec::<u64>::new(&env));
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
        Ok(())
    }

    // ── Users ──────────────────────────────────────────────────────────────────

    pub fn register(env: Env, user: Address, name: String, role: Role) -> Result<(), RegistryError> {
        user.require_auth();
        if env.storage().persistent().has(&DataKey::UserProfile(user.clone())) {
            return Err(RegistryError::AlreadyRegistered);
        }
        if name.len() == 0 || name.len() > 48 {
            return Err(RegistryError::InvalidName);
        }
        let profile = UserProfile {
            address: user.clone(),
            name,
            role,
            registered_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::UserProfile(user.clone()), &profile);
        env.storage().persistent().extend_ttl(
            &DataKey::UserProfile(user.clone()),
            LEDGER_THRESHOLD,
            LEDGER_BUMP,
        );
        env.events().publish(
            (symbol_short!("register"), user.clone()),
            env.ledger().timestamp(),
        );
        Ok(())
    }

    pub fn is_registered(env: Env, user: Address) -> bool {
        env.storage().persistent().has(&DataKey::UserProfile(user))
    }

    pub fn get_user(env: Env, user: Address) -> Result<UserProfile, RegistryError> {
        env.storage()
            .persistent()
            .get(&DataKey::UserProfile(user))
            .ok_or(RegistryError::UserNotFound)
    }

    // ── Institutions ───────────────────────────────────────────────────────────

    /// Admin-only. Adds an institution in an **unverified** state. Verification is a
    /// deliberate second step so onboarding and trust are decoupled.
    pub fn add_institution(
        env: Env,
        name: String,
        category: Category,
        payout: Address,
    ) -> Result<u64, RegistryError> {
        Self::require_admin(&env)?;
        if name.len() == 0 || name.len() > 64 {
            return Err(RegistryError::InvalidName);
        }
        let id: u64 = env.storage().instance().get(&DataKey::NextInstitutionId).unwrap_or(1);
        let institution = Institution {
            id,
            payout: payout.clone(),
            name,
            category,
            attestor: payout,
            verified: false,
            registered_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::Institution(id), &institution);
        env.storage().persistent().extend_ttl(
            &DataKey::Institution(id),
            LEDGER_THRESHOLD,
            LEDGER_BUMP,
        );
        let mut list: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::InstitutionList)
            .unwrap_or_else(|| Vec::new(&env));
        list.push_back(id);
        env.storage().instance().set(&DataKey::InstitutionList, &list);
        env.storage().instance().set(&DataKey::NextInstitutionId, &(id + 1));
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
        env.events().publish((symbol_short!("inst_add"), id), ());
        Ok(id)
    }

    /// Admin-only. Flips an institution's verified flag.
    pub fn set_verified(env: Env, id: u64, verified: bool) -> Result<(), RegistryError> {
        Self::require_admin(&env)?;
        let mut inst: Institution = env
            .storage()
            .persistent()
            .get(&DataKey::Institution(id))
            .ok_or(RegistryError::InstitutionNotFound)?;
        inst.verified = verified;
        env.storage().persistent().set(&DataKey::Institution(id), &inst);
        env.storage().persistent().extend_ttl(
            &DataKey::Institution(id),
            LEDGER_THRESHOLD,
            LEDGER_BUMP,
        );
        env.events().publish((symbol_short!("verified"), id), verified);
        Ok(())
    }

    /// Admin-only. Points an institution's attestation authority at a different key.
    pub fn set_attestor(env: Env, id: u64, attestor: Address) -> Result<(), RegistryError> {
        Self::require_admin(&env)?;
        let mut inst: Institution = env
            .storage()
            .persistent()
            .get(&DataKey::Institution(id))
            .ok_or(RegistryError::InstitutionNotFound)?;
        inst.attestor = attestor;
        env.storage().persistent().set(&DataKey::Institution(id), &inst);
        Ok(())
    }

    pub fn get_institution(env: Env, id: u64) -> Result<Institution, RegistryError> {
        env.storage()
            .persistent()
            .get(&DataKey::Institution(id))
            .ok_or(RegistryError::InstitutionNotFound)
    }

    /// Convenience getter so the escrow contract can resolve a payout address with a
    /// single cross-contract call instead of deserializing the whole struct.
    pub fn institution_payout(env: Env, id: u64) -> Result<Address, RegistryError> {
        env.storage()
            .persistent()
            .get::<_, Institution>(&DataKey::Institution(id))
            .map(|i| i.payout)
            .ok_or(RegistryError::InstitutionNotFound)
    }

    pub fn is_verified(env: Env, id: u64) -> bool {
        env.storage()
            .persistent()
            .get::<_, Institution>(&DataKey::Institution(id))
            .map(|i| i.verified)
            .unwrap_or(false)
    }

    pub fn list_institutions(env: Env) -> Vec<Institution> {
        let ids: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::InstitutionList)
            .unwrap_or_else(|| Vec::new(&env));
        let mut out: Vec<Institution> = Vec::new(&env);
        for id in ids.iter() {
            if let Some(i) = env.storage().persistent().get::<_, Institution>(&DataKey::Institution(id)) {
                out.push_back(i);
            }
        }
        out
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    fn require_admin(env: &Env) -> Result<(), RegistryError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(RegistryError::NotInitialized)?;
        admin.require_auth();
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    fn setup() -> (Env, Address, RegistryContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, RegistryContract);
        let client = RegistryContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    #[test]
    fn test_register_user() {
        let (env, _admin, client) = setup();
        let user = Address::generate(&env);
        client.register(&user, &String::from_str(&env, "Ada"), &Role::Sender);
        assert!(client.is_registered(&user));
        let p = client.get_user(&user);
        assert_eq!(p.role, Role::Sender);
    }

    #[test]
    fn test_duplicate_register_fails() {
        let (env, _admin, client) = setup();
        let user = Address::generate(&env);
        client.register(&user, &String::from_str(&env, "Ada"), &Role::Recipient);
        assert!(client
            .try_register(&user, &String::from_str(&env, "Ada2"), &Role::Recipient)
            .is_err());
    }

    #[test]
    fn test_empty_name_fails() {
        let (env, _admin, client) = setup();
        let user = Address::generate(&env);
        assert!(client
            .try_register(&user, &String::from_str(&env, ""), &Role::Sender)
            .is_err());
    }

    #[test]
    fn test_add_and_get_institution() {
        let (env, _admin, client) = setup();
        let payout = Address::generate(&env);
        let id = client.add_institution(
            &String::from_str(&env, "Lagos Grammar School"),
            &Category::School,
            &payout,
        );
        assert_eq!(id, 1);
        let inst = client.get_institution(&id);
        assert_eq!(inst.category, Category::School);
        assert_eq!(inst.payout, payout);
        // Newly added institutions start unverified.
        assert!(!inst.verified);
        assert!(!client.is_verified(&id));
    }

    #[test]
    fn test_verify_institution() {
        let (env, _admin, client) = setup();
        let payout = Address::generate(&env);
        let id = client.add_institution(
            &String::from_str(&env, "St. Mary Clinic"),
            &Category::Clinic,
            &payout,
        );
        client.set_verified(&id, &true);
        assert!(client.is_verified(&id));
        client.set_verified(&id, &false);
        assert!(!client.is_verified(&id));
    }

    #[test]
    fn test_list_institutions() {
        let (env, _admin, client) = setup();
        let a = Address::generate(&env);
        let b = Address::generate(&env);
        client.add_institution(&String::from_str(&env, "School A"), &Category::School, &a);
        client.add_institution(&String::from_str(&env, "Landlord B"), &Category::Landlord, &b);
        let list = client.list_institutions();
        assert_eq!(list.len(), 2);
        assert_eq!(list.get(1).unwrap().category, Category::Landlord);
    }

    #[test]
    fn test_set_attestor() {
        let (env, _admin, client) = setup();
        let payout = Address::generate(&env);
        let bursar = Address::generate(&env);
        let id = client.add_institution(&String::from_str(&env, "Uni"), &Category::School, &payout);
        // attestor defaults to payout
        assert_eq!(client.get_institution(&id).attestor, payout);
        client.set_attestor(&id, &bursar);
        assert_eq!(client.get_institution(&id).attestor, bursar);
    }

    #[test]
    fn test_get_missing_institution_fails() {
        let (_env, _admin, client) = setup();
        assert!(client.try_get_institution(&999u64).is_err());
        assert!(!client.is_verified(&999u64));
    }

    #[test]
    fn test_double_initialize_fails() {
        let (_env, admin, client) = setup();
        assert!(client.try_initialize(&admin).is_err());
    }
}

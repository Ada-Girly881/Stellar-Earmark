#![no_std]
//! Earmark Attestation
//!
//! The "last mile" of a conditional remittance: a trusted party confirming that the
//! real-world condition was met (enrollment confirmed, invoice issued, rent received).
//! The escrow contract treats a `Confirmed` attestation as the signal to release funds,
//! and a `Rejected` attestation as the signal that the sender may refund.
//!
//! Trust model: an `admin` (the platform oracle) maintains an allowlist of **attestors**
//! — typically the bursar/clinic/landlord keys behind verified institutions. Only the
//! admin or an allowlisted attestor may post an attestation. Each earmark can be
//! attested exactly once; re-attesting is rejected so a release decision can't be flipped
//! out from under the escrow.
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short,
    Address, Env, String,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Attestation(u64),
    Attestor(Address),
    Admin,
    Initialized,
}

#[derive(Clone, Copy, Debug, PartialEq)]
#[contracttype]
pub enum AttestStatus {
    Confirmed,
    Rejected,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Attestation {
    pub earmark_id: u64,
    pub attestor: Address,
    pub status: AttestStatus,
    pub note: String,
    pub attested_at: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum AttestError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    AlreadyAttested = 4,
    NotFound = 5,
    NoteTooLong = 6,
}

const LEDGER_BUMP: u32 = 120960;
const LEDGER_THRESHOLD: u32 = 103680;

#[contract]
pub struct AttestationContract;

#[contractimpl]
impl AttestationContract {
    pub fn initialize(env: Env, admin: Address) -> Result<(), AttestError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(AttestError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
        Ok(())
    }

    /// Admin-only. Authorizes a key to post attestations (e.g. a school bursar).
    pub fn add_attestor(env: Env, attestor: Address) -> Result<(), AttestError> {
        Self::require_admin(&env)?;
        env.storage().persistent().set(&DataKey::Attestor(attestor.clone()), &true);
        env.storage().persistent().extend_ttl(
            &DataKey::Attestor(attestor.clone()),
            LEDGER_THRESHOLD,
            LEDGER_BUMP,
        );
        env.events().publish((symbol_short!("att_add"), attestor), ());
        Ok(())
    }

    pub fn remove_attestor(env: Env, attestor: Address) -> Result<(), AttestError> {
        Self::require_admin(&env)?;
        env.storage().persistent().remove(&DataKey::Attestor(attestor));
        Ok(())
    }

    pub fn is_attestor(env: Env, who: Address) -> bool {
        let admin: Option<Address> = env.storage().instance().get(&DataKey::Admin);
        if admin.as_ref() == Some(&who) {
            return true;
        }
        env.storage().persistent().get::<_, bool>(&DataKey::Attestor(who)).unwrap_or(false)
    }

    /// Post the one-and-only attestation for an earmark. Caller must be the admin or an
    /// allowlisted attestor, and must sign.
    pub fn attest(
        env: Env,
        attestor: Address,
        earmark_id: u64,
        status: AttestStatus,
        note: String,
    ) -> Result<(), AttestError> {
        attestor.require_auth();
        if !Self::is_attestor(env.clone(), attestor.clone()) {
            return Err(AttestError::Unauthorized);
        }
        if note.len() > 100 {
            return Err(AttestError::NoteTooLong);
        }
        if env.storage().persistent().has(&DataKey::Attestation(earmark_id)) {
            return Err(AttestError::AlreadyAttested);
        }
        let attestation = Attestation {
            earmark_id,
            attestor: attestor.clone(),
            status,
            note,
            attested_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&DataKey::Attestation(earmark_id), &attestation);
        env.storage().persistent().extend_ttl(
            &DataKey::Attestation(earmark_id),
            LEDGER_THRESHOLD,
            LEDGER_BUMP,
        );
        env.events().publish(
            (symbol_short!("attest"), earmark_id),
            (attestor, status),
        );
        Ok(())
    }

    pub fn get_attestation(env: Env, earmark_id: u64) -> Result<Attestation, AttestError> {
        env.storage()
            .persistent()
            .get(&DataKey::Attestation(earmark_id))
            .ok_or(AttestError::NotFound)
    }

    /// True only when an earmark has been confirmed. Escrow gates release on this.
    pub fn is_confirmed(env: Env, earmark_id: u64) -> bool {
        env.storage()
            .persistent()
            .get::<_, Attestation>(&DataKey::Attestation(earmark_id))
            .map(|a| a.status == AttestStatus::Confirmed)
            .unwrap_or(false)
    }

    /// True when an earmark has been explicitly rejected. Escrow uses this to fast-track
    /// a sender refund without waiting for a timeout.
    pub fn is_rejected(env: Env, earmark_id: u64) -> bool {
        env.storage()
            .persistent()
            .get::<_, Attestation>(&DataKey::Attestation(earmark_id))
            .map(|a| a.status == AttestStatus::Rejected)
            .unwrap_or(false)
    }

    pub fn admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    fn require_admin(env: &Env) -> Result<(), AttestError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(AttestError::NotInitialized)?;
        admin.require_auth();
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env, String};

    fn setup() -> (Env, Address, AttestationContractClient<'static>) {
        let env = Env::default();
        env.mock_all_auths();
        let id = env.register_contract(None, AttestationContract);
        let client = AttestationContractClient::new(&env, &id);
        let admin = Address::generate(&env);
        client.initialize(&admin);
        (env, admin, client)
    }

    #[test]
    fn test_admin_can_attest() {
        let (env, admin, client) = setup();
        client.attest(&admin, &1u64, &AttestStatus::Confirmed, &String::from_str(&env, "Enrolled"));
        assert!(client.is_confirmed(&1u64));
        assert!(!client.is_rejected(&1u64));
    }

    #[test]
    fn test_allowlisted_attestor() {
        let (env, _admin, client) = setup();
        let bursar = Address::generate(&env);
        assert!(!client.is_attestor(&bursar));
        client.add_attestor(&bursar);
        assert!(client.is_attestor(&bursar));
        client.attest(&bursar, &7u64, &AttestStatus::Confirmed, &String::from_str(&env, "ok"));
        assert!(client.is_confirmed(&7u64));
    }

    #[test]
    fn test_unauthorized_attestor_fails() {
        let (env, _admin, client) = setup();
        let stranger = Address::generate(&env);
        let r = client.try_attest(&stranger, &1u64, &AttestStatus::Confirmed, &String::from_str(&env, "x"));
        assert!(r.is_err());
    }

    #[test]
    fn test_double_attest_fails() {
        let (env, admin, client) = setup();
        client.attest(&admin, &1u64, &AttestStatus::Confirmed, &String::from_str(&env, "a"));
        let r = client.try_attest(&admin, &1u64, &AttestStatus::Rejected, &String::from_str(&env, "b"));
        assert!(r.is_err());
        // First decision stands.
        assert!(client.is_confirmed(&1u64));
    }

    #[test]
    fn test_rejected_status() {
        let (env, admin, client) = setup();
        client.attest(&admin, &3u64, &AttestStatus::Rejected, &String::from_str(&env, "no record"));
        assert!(client.is_rejected(&3u64));
        assert!(!client.is_confirmed(&3u64));
    }

    #[test]
    fn test_remove_attestor() {
        let (env, _admin, client) = setup();
        let bursar = Address::generate(&env);
        client.add_attestor(&bursar);
        client.remove_attestor(&bursar);
        assert!(!client.is_attestor(&bursar));
    }

    #[test]
    fn test_unattested_is_neither() {
        let (_env, _admin, client) = setup();
        assert!(!client.is_confirmed(&42u64));
        assert!(!client.is_rejected(&42u64));
        assert!(client.try_get_attestation(&42u64).is_err());
    }
}

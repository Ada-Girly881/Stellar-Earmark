#![no_std]
//! Earmark Streaming
//!
//! Turns a lump sum into a drip. A sender locks USDC up front; it vests linearly to the
//! recipient over a chosen duration, and the recipient withdraws whatever has vested so
//! far whenever they like. A month's support actually lasts a month instead of being
//! spent in a week.
//!
//! The sender keeps control: they can **pause** a stream (vesting freezes), **resume** it,
//! or **cancel** it — on cancel, everything vested-but-not-yet-withdrawn is paid to the
//! recipient and the remaining unvested principal is returned to the sender.
//!
//! USDC moves via the standard token interface (the real USDC SAC on-chain; a test SAC in
//! unit tests).
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, symbol_short,
    token, Address, Env, String, Vec,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Stream(u64),
    SenderStreams(Address),
    RecipientStreams(Address),
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
}

#[derive(Clone, Copy, Debug, PartialEq)]
#[contracttype]
pub enum StreamStatus {
    Active,
    Paused,
    Cancelled,
    Completed,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct Stream {
    pub id: u64,
    pub sender: Address,
    pub recipient: Address,
    pub total: i128,
    pub withdrawn: i128,
    pub start_ts: u64,
    pub duration: u64,
    pub purpose: String,
    pub status: StreamStatus,
    /// Timestamp the stream was paused (0 when running).
    pub paused_at: u64,
    /// Total seconds spent paused before the current run.
    pub paused_accum: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum StreamError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    InvalidAmount = 4,
    InvalidDuration = 5,
    NotFound = 6,
    NotActive = 7,
    NotPaused = 8,
    AlreadyEnded = 9,
    NothingToWithdraw = 10,
    PurposeTooLong = 11,
}

const LEDGER_BUMP: u32 = 120960;
const LEDGER_THRESHOLD: u32 = 103680;

#[contract]
pub struct StreamingContract;

#[contractimpl]
impl StreamingContract {
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), StreamError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(StreamError::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Config, &Config { admin, token });
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage().instance().set(&DataKey::NextId, &1u64);
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);
        Ok(())
    }

    /// Lock `total` USDC to drip to `recipient` over `duration` seconds.
    pub fn create_stream(
        env: Env,
        sender: Address,
        recipient: Address,
        total: i128,
        duration: u64,
        purpose: String,
    ) -> Result<u64, StreamError> {
        sender.require_auth();
        if total <= 0 {
            return Err(StreamError::InvalidAmount);
        }
        if duration == 0 {
            return Err(StreamError::InvalidDuration);
        }
        if purpose.len() > 100 {
            return Err(StreamError::PurposeTooLong);
        }
        let config: Config = env
            .storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(StreamError::NotInitialized)?;

        let token_client = token::Client::new(&env, &config.token);
        token_client.transfer(&sender, &env.current_contract_address(), &total);

        let id: u64 = env.storage().instance().get(&DataKey::NextId).unwrap_or(1);
        let stream = Stream {
            id,
            sender: sender.clone(),
            recipient: recipient.clone(),
            total,
            withdrawn: 0,
            start_ts: env.ledger().timestamp(),
            duration,
            purpose,
            status: StreamStatus::Active,
            paused_at: 0,
            paused_accum: 0,
        };
        env.storage().persistent().set(&DataKey::Stream(id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(id), LEDGER_THRESHOLD, LEDGER_BUMP);

        Self::index_push(&env, DataKey::SenderStreams(sender.clone()), id);
        Self::index_push(&env, DataKey::RecipientStreams(recipient.clone()), id);

        env.storage().instance().set(&DataKey::NextId, &(id + 1));
        env.storage().instance().extend_ttl(LEDGER_THRESHOLD, LEDGER_BUMP);

        env.events().publish((symbol_short!("stream"), sender, recipient), (id, total));
        Ok(id)
    }

    /// Recipient pulls everything vested so far.
    pub fn withdraw(env: Env, stream_id: u64) -> Result<i128, StreamError> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;
        stream.recipient.require_auth();
        if stream.status == StreamStatus::Cancelled {
            return Err(StreamError::AlreadyEnded);
        }
        let vested = Self::vested_amount(&env, &stream);
        let amount = vested - stream.withdrawn;
        if amount <= 0 {
            return Err(StreamError::NothingToWithdraw);
        }
        let config: Config = env.storage().instance().get(&DataKey::Config).unwrap();
        let token_client = token::Client::new(&env, &config.token);
        token_client.transfer(&env.current_contract_address(), &stream.recipient, &amount);

        stream.withdrawn += amount;
        if stream.withdrawn >= stream.total {
            stream.status = StreamStatus::Completed;
        }
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.storage().persistent().extend_ttl(&DataKey::Stream(stream_id), LEDGER_THRESHOLD, LEDGER_BUMP);
        env.events().publish((symbol_short!("withdraw"), stream.recipient.clone()), (stream_id, amount));
        Ok(amount)
    }

    /// Sender freezes vesting.
    pub fn pause(env: Env, stream_id: u64) -> Result<(), StreamError> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;
        stream.sender.require_auth();
        if stream.status != StreamStatus::Active {
            return Err(StreamError::NotActive);
        }
        stream.status = StreamStatus::Paused;
        stream.paused_at = env.ledger().timestamp();
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.events().publish((symbol_short!("pause"),), stream_id);
        Ok(())
    }

    /// Sender resumes a paused stream; paused time is excluded from vesting.
    pub fn resume(env: Env, stream_id: u64) -> Result<(), StreamError> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;
        stream.sender.require_auth();
        if stream.status != StreamStatus::Paused {
            return Err(StreamError::NotPaused);
        }
        let paused_for = env.ledger().timestamp().saturating_sub(stream.paused_at);
        stream.paused_accum = stream.paused_accum.saturating_add(paused_for);
        stream.paused_at = 0;
        stream.status = StreamStatus::Active;
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.events().publish((symbol_short!("resume"),), stream_id);
        Ok(())
    }

    /// Sender cancels. Vested-but-unwithdrawn funds go to the recipient; the unvested
    /// remainder returns to the sender.
    pub fn cancel(env: Env, stream_id: u64) -> Result<(), StreamError> {
        let mut stream: Stream = env
            .storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)?;
        stream.sender.require_auth();
        if stream.status == StreamStatus::Cancelled || stream.status == StreamStatus::Completed {
            return Err(StreamError::AlreadyEnded);
        }
        let vested = Self::vested_amount(&env, &stream);
        let to_recipient = vested - stream.withdrawn;
        let to_sender = stream.total - vested;

        let config: Config = env.storage().instance().get(&DataKey::Config).unwrap();
        let token_client = token::Client::new(&env, &config.token);
        if to_recipient > 0 {
            token_client.transfer(&env.current_contract_address(), &stream.recipient, &to_recipient);
            stream.withdrawn += to_recipient;
        }
        if to_sender > 0 {
            token_client.transfer(&env.current_contract_address(), &stream.sender, &to_sender);
        }
        stream.status = StreamStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Stream(stream_id), &stream);
        env.events().publish((symbol_short!("cancel"), stream.sender.clone()), (stream_id, to_sender));
        Ok(())
    }

    // ── Views ──────────────────────────────────────────────────────────────────

    /// How much the recipient could withdraw right now.
    pub fn withdrawable(env: Env, stream_id: u64) -> i128 {
        match env.storage().persistent().get::<_, Stream>(&DataKey::Stream(stream_id)) {
            Some(s) if s.status != StreamStatus::Cancelled => {
                let v = Self::vested_amount(&env, &s);
                let w = v - s.withdrawn;
                if w > 0 { w } else { 0 }
            }
            _ => 0,
        }
    }

    pub fn get_stream(env: Env, stream_id: u64) -> Result<Stream, StreamError> {
        env.storage()
            .persistent()
            .get(&DataKey::Stream(stream_id))
            .ok_or(StreamError::NotFound)
    }

    pub fn get_sender_streams(env: Env, sender: Address) -> Vec<Stream> {
        Self::collect(&env, DataKey::SenderStreams(sender))
    }

    pub fn get_recipient_streams(env: Env, recipient: Address) -> Vec<Stream> {
        Self::collect(&env, DataKey::RecipientStreams(recipient))
    }

    pub fn config(env: Env) -> Config {
        env.storage().instance().get(&DataKey::Config).unwrap()
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    /// Linear vesting over active (un-paused) time, clamped to `total`.
    fn vested_amount(env: &Env, s: &Stream) -> i128 {
        let now = env.ledger().timestamp();
        // Seconds the stream has actually been running.
        let mut active = now.saturating_sub(s.start_ts).saturating_sub(s.paused_accum);
        if s.status == StreamStatus::Paused {
            active = active.saturating_sub(now.saturating_sub(s.paused_at));
        }
        if active >= s.duration {
            return s.total;
        }
        // total * active / duration
        (s.total * active as i128) / s.duration as i128
    }

    fn index_push(env: &Env, key: DataKey, id: u64) {
        let mut list: Vec<u64> = env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env));
        list.push_back(id);
        env.storage().persistent().set(&key, &list);
        env.storage().persistent().extend_ttl(&key, LEDGER_THRESHOLD, LEDGER_BUMP);
    }

    fn collect(env: &Env, key: DataKey) -> Vec<Stream> {
        let ids: Vec<u64> = env.storage().persistent().get(&key).unwrap_or_else(|| Vec::new(env));
        let mut out: Vec<Stream> = Vec::new(env);
        for id in ids.iter() {
            if let Some(s) = env.storage().persistent().get::<_, Stream>(&DataKey::Stream(id)) {
                out.push_back(s);
            }
        }
        out
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger},
        token::{StellarAssetClient, TokenClient},
        Address, Env, String,
    };

    struct World {
        env: Env,
        token: TokenClient<'static>,
        token_admin: StellarAssetClient<'static>,
        streaming: StreamingContractClient<'static>,
    }

    fn setup() -> World {
        let env = Env::default();
        env.mock_all_auths();
        env.ledger().with_mut(|l| l.timestamp = 1_000_000);
        let admin = Address::generate(&env);
        let sac = env.register_stellar_asset_contract_v2(admin.clone());
        let token_id = sac.address();
        let str_id = env.register_contract(None, StreamingContract);
        let streaming = StreamingContractClient::new(&env, &str_id);
        streaming.initialize(&admin, &token_id);
        World {
            env: env.clone(),
            token: TokenClient::new(&env, &token_id),
            token_admin: StellarAssetClient::new(&env, &token_id),
            streaming,
        }
    }

    fn mk_stream(w: &World, total: &i128, duration: &u64) -> (Address, Address, u64) {
        let sender = Address::generate(&w.env);
        let recipient = Address::generate(&w.env);
        w.token_admin.mint(&sender, total);
        let id = w.streaming.create_stream(
            &sender, &recipient, total, duration, &String::from_str(&w.env, "Monthly support"),
        );
        (sender, recipient, id)
    }

    fn advance(w: &World, secs: u64) {
        let t = w.env.ledger().timestamp();
        w.env.ledger().with_mut(|l| l.timestamp = t + secs);
    }

    #[test]
    fn test_linear_vesting_half() {
        let w = setup();
        let (_s, recipient, id) = mk_stream(&w, &1_000_0000000, &1000);
        advance(&w, 500); // halfway
        assert_eq!(w.streaming.withdrawable(&id), 500_0000000);
        let got = w.streaming.withdraw(&id);
        assert_eq!(got, 500_0000000);
        assert_eq!(w.token.balance(&recipient), 500_0000000);
        // Nothing left immediately after.
        assert_eq!(w.streaming.withdrawable(&id), 0);
    }

    #[test]
    fn test_full_vesting_completes() {
        let w = setup();
        let (_s, recipient, id) = mk_stream(&w, &600_0000000, &1000);
        advance(&w, 2000); // past end
        assert_eq!(w.streaming.withdrawable(&id), 600_0000000);
        w.streaming.withdraw(&id);
        assert_eq!(w.token.balance(&recipient), 600_0000000);
        assert_eq!(w.streaming.get_stream(&id).status, StreamStatus::Completed);
    }

    #[test]
    fn test_pause_freezes_vesting() {
        let w = setup();
        let (_s, _r, id) = mk_stream(&w, &1_000_0000000, &1000);
        advance(&w, 200); // 20%
        w.streaming.pause(&id);
        advance(&w, 10_000); // long time passes while paused
        // Still only 20% vested.
        assert_eq!(w.streaming.withdrawable(&id), 200_0000000);
        w.streaming.resume(&id);
        advance(&w, 300); // now 50% of active time
        assert_eq!(w.streaming.withdrawable(&id), 500_0000000);
    }

    #[test]
    fn test_cancel_splits_funds() {
        let w = setup();
        let (sender, recipient, id) = mk_stream(&w, &1_000_0000000, &1000);
        advance(&w, 300); // 30% vested
        w.streaming.cancel(&id);
        assert_eq!(w.token.balance(&recipient), 300_0000000);
        assert_eq!(w.token.balance(&sender), 700_0000000);
        assert_eq!(w.streaming.get_stream(&id).status, StreamStatus::Cancelled);
    }

    #[test]
    fn test_cancel_after_partial_withdraw() {
        let w = setup();
        let (sender, recipient, id) = mk_stream(&w, &1_000_0000000, &1000);
        advance(&w, 400);
        w.streaming.withdraw(&id); // recipient takes 400
        advance(&w, 200); // now 60% vested
        w.streaming.cancel(&id);
        // recipient: 600 total vested, sender: 400 unvested
        assert_eq!(w.token.balance(&recipient), 600_0000000);
        assert_eq!(w.token.balance(&sender), 400_0000000);
    }

    #[test]
    fn test_withdraw_nothing_fails() {
        let w = setup();
        let (_s, _r, id) = mk_stream(&w, &1_000_0000000, &1000);
        // No time has passed.
        assert!(w.streaming.try_withdraw(&id).is_err());
    }

    #[test]
    fn test_zero_total_rejected() {
        let w = setup();
        let sender = Address::generate(&w.env);
        let recipient = Address::generate(&w.env);
        let r = w.streaming.try_create_stream(
            &sender, &recipient, &0i128, &1000u64, &String::from_str(&w.env, "x"),
        );
        assert!(r.is_err());
    }

    #[test]
    fn test_cannot_pause_paused() {
        let w = setup();
        let (_s, _r, id) = mk_stream(&w, &1_000_0000000, &1000);
        w.streaming.pause(&id);
        assert!(w.streaming.try_pause(&id).is_err());
    }

    #[test]
    fn test_indexing() {
        let w = setup();
        let (sender, recipient, _id) = mk_stream(&w, &500_0000000, &1000);
        assert_eq!(w.streaming.get_sender_streams(&sender).len(), 1);
        assert_eq!(w.streaming.get_recipient_streams(&recipient).len(), 1);
    }
}

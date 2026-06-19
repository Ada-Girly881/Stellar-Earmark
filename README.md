# Earmark

**Send money home, with strings attached — the good kind.**

Conditional remittances on Stellar, settled in **real USDC**. Attach a condition before funds are
released, stream support over time so a month's money lasts a month, or route funds straight to a
verified school, clinic or landlord — all on-chain, non-custodial, corridor-agnostic.

---

**Live on Stellar Testnet** &nbsp;|&nbsp; Settled in real USDC &nbsp;|&nbsp; Non-custodial Soroban escrow

---

## The problem

Remittances are a $900B annual lifeline, but senders lose all control the moment funds land. Money
meant for school fees, rent, or medicine gets redirected or burned through in a week instead of a
month. Every rail today offers the same all-or-nothing deal: send the lump sum and hope.

This isn't a trust problem with family — it's a **tooling** problem, and it's universal: a nurse in
the UK supporting parents in Nigeria, a worker in the US sending to Mexico, a domestic worker in
Singapore funding a sibling's tuition in the Philippines. Same need, same gap.

## What Earmark does

| Mode | What it does |
|------|--------------|
| **Conditional release** | Funds unlock only when a verifiable condition is attested on-chain (enrollment confirmed, invoice issued). Until then they sit in escrow — refundable by the sender if the condition is rejected or the window expires. |
| **Streaming** | Lock a lump sum that vests linearly to the recipient over days or weeks. The recipient withdraws what's vested; the sender can pause, resume, or cancel anytime (cancel splits funds fairly). |
| **Direct-to-purpose** | Route funds straight to a **verified institution's** payout address — bypassing the temptation of cash. Escrow refuses payouts to anything unverified. |

## Why on-chain

1. **Programmable escrow without an intermediary** — funds are held and released by code, not a
   company that can freeze, skim, or fold.
2. **Corridor-agnostic settlement** — USDC doesn't care about borders or banking hours. The same
   contract works US→Mexico, UK→Nigeria, or Gulf→South Asia.
3. **Verifiable conditions** — both parties (and the attesting institution) independently confirm
   what was set and whether it was met. No opaque middleman.

---

## Architecture

Four Soroban contracts, all moving **real USDC** via the Stellar Asset Contract (SAC) — no mock token.

```
                         ┌──────────────────────┐
   sender ──create──────▶│       escrow         │──release──▶ recipient / institution
                         │  holds USDC in trust  │──refund───▶ sender
                         └───────┬───────┬───────┘
                  is_verified()  │       │  is_confirmed() / is_rejected()
                         ┌───────▼──┐  ┌──▼──────────┐
                         │ registry │  │ attestation │◀── verified institution / oracle
                         │ (moat)   │  └─────────────┘
                         └──────────┘
   sender ──create──────▶┌──────────────────────┐
                         │      streaming        │──withdraw─▶ recipient (linear vesting)
                         │  pause/resume/cancel  │
                         └──────────────────────┘
```

| Contract | Responsibility |
|----------|----------------|
| **registry** | User profiles (sender/recipient) + **verified institutions** (school, clinic, landlord, utility, merchant) with payout + attestor addresses. Verification is admin-gated. |
| **attestation** | One-time `Confirmed`/`Rejected` attestations per earmark, posted by the admin oracle or an allowlisted institution key. Escrow gates release on this. |
| **escrow** | Conditional & direct-to-purpose earmarks. Pulls USDC into trust on create; releases to recipient/institution on confirmation; refunds the sender on rejection or expiry. |
| **streaming** | Linear-vesting drips. Recipient withdraws vested USDC; sender can pause (freezes vesting), resume, or cancel (vested → recipient, remainder → sender). |

### Deployed on Testnet

| Contract | Address |
|----------|---------|
| USDC (SAC) | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| Registry | `CDTLFQAWRONKD6DUO3HEZJN66QW7ZAW35GWT6EPFTIEROSOXU2UARJWZ` |
| Attestation | `CDF6D6NBPE22XPOOSNDOYK6IAYDIOCQ4HWEVG7MFUU7JQGAEINZO3ZXT` |
| Escrow | `CC3SD43W5NXKYFB6Y62WP2MZI2JRRWHGY74AOILM5F6IQOQMIANTBNCQ` |
| Streaming | `CBYZHWCEIDY6SFIN3BIPDKUDMSZ7GQNWPNIXOUJPRNC7RIFWBLUZNLB2` |

USDC issuer (testnet): `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
Deployer / admin: `GDQ6QUVINBCLB3ZCA5BHDBI6E7BNJGCIDWX7WPE2F7UYSGD7P5KBPM2F`

---

## Quick start

### Run the frontend (already wired to testnet)

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Install [Freighter](https://www.freighter.app/) and switch it to **Testnet**.

### Get test USDC

1. In-app, click **Add USDC trustline** (signs a classic `changeTrust` op via Freighter).
2. Fund the wallet from the [Circle testnet faucet](https://faucet.circle.com/) (select Stellar).

You can now create earmarks and streams in real USDC.

---

## Build & deploy yourself

```bash
# 1. Toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
cargo install --locked stellar-cli --features opt

# 2. Fund a deployer key
stellar keys generate deployer --network testnet
curl "https://friendbot.stellar.org/?addr=$(stellar keys address deployer)"

# 3. Build, resolve the USDC SAC, deploy + initialise everything, write frontend/.env.local
./scripts/deploy.sh testnet deployer

# 4. Seed a few verified demo institutions
./scripts/seed.sh testnet deployer
```

`deploy.sh` resolves the canonical USDC Stellar Asset Contract for the network (deploying the SAC
wrapper if needed) and wires it into escrow and streaming — so the app transacts in the same USDC
everyone else on Stellar uses.

## Tests

```bash
cargo test --workspace        # 33 contract tests across the 4 contracts
```

---

## Stack

- **Contracts** — Rust, Soroban SDK 21, `wasm32v1-none`, real USDC via the Stellar Asset Contract
- **Frontend** — Next.js 14, Tailwind, Zustand, React Query, Framer Motion
- **Wallet** — Freighter (`@stellar/freighter-api` v3)
- **Network** — Stellar Testnet, Soroban RPC

## The hard part (and where the real product lives)

Escrow and streaming are well-trodden. The moat is the **last mile**: verified institutional
recipients and lightweight attestation (the `registry` + `attestation` contracts here), per-corridor
on/off-ramps, and a recipient UX that hides the chain entirely. Earmark is designed so the framing
stays collaborative — the recipient opts in, sees the plan, and keeps a discretionary portion —
rather than surveillance-y.

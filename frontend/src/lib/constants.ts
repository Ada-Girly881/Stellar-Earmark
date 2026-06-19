import { Networks } from '@stellar/stellar-sdk';

export const NETWORK = (process.env.NEXT_PUBLIC_NETWORK ?? 'TESTNET') as 'TESTNET' | 'MAINNET';

export const NETWORK_PASSPHRASE =
  NETWORK === 'MAINNET' ? Networks.PUBLIC : Networks.TESTNET;

export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';

export const HORIZON_URL =
  NETWORK === 'MAINNET'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';

// ── Real USDC on Stellar ────────────────────────────────────────────────────
export const USDC = {
  code: process.env.NEXT_PUBLIC_USDC_CODE ?? 'USDC',
  issuer:
    process.env.NEXT_PUBLIC_USDC_ISSUER ??
    'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  // SAC address — the Soroban-callable wrapper of the classic USDC asset.
  contractId: process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ?? '',
  decimals: 7,
} as const;

// Where to get test USDC for a demo wallet.
export const USDC_FAUCET = 'https://faucet.circle.com/';

export const CONTRACT_ADDRESSES = {
  REGISTRY:    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID    ?? '',
  ATTESTATION: process.env.NEXT_PUBLIC_ATTESTATION_CONTRACT_ID ?? '',
  ESCROW:      process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID      ?? '',
  STREAMING:   process.env.NEXT_PUBLIC_STREAMING_CONTRACT_ID   ?? '',
} as const;

export const TX_TIMEOUT = 30; // seconds
export const BASE_FEE = '10000000'; // 1 XLM max fee
export const POLL_INTERVAL_MS = 20_000;
export const COUNTER_TICK_MS = 1_000;

export const FREIGHTER_DOWNLOAD = 'https://www.freighter.app/';
export const EXPLORER = 'https://stellar.expert/explorer/testnet';

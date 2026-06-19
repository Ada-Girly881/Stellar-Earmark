// ── Contract data types (mirroring the Soroban contracttype structs) ──────────

export type Role = 'Sender' | 'Recipient';

export type Category = 'School' | 'Clinic' | 'Landlord' | 'Utility' | 'Merchant';

export type ReleaseMode = 'ConditionalRecipient' | 'DirectInstitution';

export type EarmarkStatus = 'Active' | 'Released' | 'Refunded';

export type StreamStatus = 'Active' | 'Paused' | 'Cancelled' | 'Completed';

export type AttestStatus = 'Confirmed' | 'Rejected';

export interface UserProfile {
  address: string;
  name: string;
  role: Role;
  registeredAt: bigint;
}

export interface Institution {
  id: bigint;
  payout: string;
  name: string;
  category: Category;
  attestor: string;
  verified: boolean;
  registeredAt: bigint;
}

export interface Earmark {
  id: bigint;
  sender: string;
  recipient: string;
  mode: ReleaseMode;
  institutionId: bigint;
  amount: bigint; // in USDC stroops (7 decimals)
  purpose: string;
  status: EarmarkStatus;
  createdAt: bigint;
  expiry: bigint;
}

export interface Stream {
  id: bigint;
  sender: string;
  recipient: string;
  total: bigint;
  withdrawn: bigint;
  startTs: bigint;
  duration: bigint;
  purpose: string;
  status: StreamStatus;
  pausedAt: bigint;
  pausedAccum: bigint;
}

export interface Attestation {
  earmarkId: bigint;
  attestor: string;
  status: AttestStatus;
  note: string;
  attestedAt: bigint;
}

// ── UI state ──────────────────────────────────────────────────────────────────

export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ── Enum index maps (match the #[repr(u32)] order in the contracts) ───────────

export const ROLE_INDEX: Record<Role, number> = { Sender: 0, Recipient: 1 };
export const ROLE_FROM_INDEX: Role[] = ['Sender', 'Recipient'];

export const CATEGORY_INDEX: Record<Category, number> = {
  School: 0,
  Clinic: 1,
  Landlord: 2,
  Utility: 3,
  Merchant: 4,
};
export const CATEGORY_FROM_INDEX: Category[] = ['School', 'Clinic', 'Landlord', 'Utility', 'Merchant'];

export const RELEASE_MODE_INDEX: Record<ReleaseMode, number> = {
  ConditionalRecipient: 0,
  DirectInstitution: 1,
};
export const RELEASE_MODE_FROM_INDEX: ReleaseMode[] = ['ConditionalRecipient', 'DirectInstitution'];

export const EARMARK_STATUS_FROM_INDEX: EarmarkStatus[] = ['Active', 'Released', 'Refunded'];
export const STREAM_STATUS_FROM_INDEX: StreamStatus[] = ['Active', 'Paused', 'Cancelled', 'Completed'];
export const ATTEST_STATUS_INDEX: Record<AttestStatus, number> = { Confirmed: 0, Rejected: 1 };
export const ATTEST_STATUS_FROM_INDEX: AttestStatus[] = ['Confirmed', 'Rejected'];

// ── Category presentation ─────────────────────────────────────────────────────

export interface CategoryMeta {
  label: string;
  color: string;
  emoji: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  School:   { label: 'School',   color: '#5bb8ff', emoji: '🎓' },
  Clinic:   { label: 'Clinic',   color: '#2fd6b0', emoji: '🏥' },
  Landlord: { label: 'Landlord', color: '#ffc55c', emoji: '🏠' },
  Utility:  { label: 'Utility',  color: '#8b9cff', emoji: '⚡' },
  Merchant: { label: 'Merchant', color: '#ff7a8a', emoji: '🛒' },
};

// ── Amount helpers (USDC = 7 decimals on Stellar) ─────────────────────────────

const USDC_UNIT = 10_000_000;

export function usdcToStroops(usdc: number): bigint {
  return BigInt(Math.round(usdc * USDC_UNIT));
}

export function stroopsToUsdc(stroops: bigint): number {
  return Number(stroops) / USDC_UNIT;
}

export function formatUsdc(stroops: bigint | number): string {
  const n = typeof stroops === 'bigint' ? stroopsToUsdc(stroops) : stroops;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function streamProgress(s: Stream): number {
  if (s.total === 0n) return 0;
  return Math.min(100, (Number(s.withdrawn) / Number(s.total)) * 100);
}

export function formatTimeLeft(expiry: bigint): string {
  const secs = Number(expiry) - Math.floor(Date.now() / 1000);
  if (secs <= 0) return 'expired';
  const days = Math.floor(secs / 86400);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(secs / 3600);
  if (hours >= 1) return `${hours}h left`;
  return `${Math.floor(secs / 60)}m left`;
}

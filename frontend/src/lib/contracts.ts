/**
 * High-level Earmark contract bindings. Each function maps to a Soroban call on one of
 * the four contracts (registry, attestation, escrow, streaming) or the USDC SAC.
 */
import {
  simulateContractCall,
  invokeContractCall,
  addressToScVal,
  u64ToScVal,
  i128ToScVal,
  stringToScVal,
  boolToScVal,
  enumToScVal,
} from './stellar';
import { CONTRACT_ADDRESSES, USDC } from './constants';
import {
  CATEGORY_INDEX,
  ROLE_INDEX,
  RELEASE_MODE_FROM_INDEX,
  EARMARK_STATUS_FROM_INDEX,
  STREAM_STATUS_FROM_INDEX,
  ATTEST_STATUS_FROM_INDEX,
} from '@/types';
import type {
  UserProfile,
  Institution,
  Earmark,
  Stream,
  Attestation,
  Role,
  Category,
  ReleaseMode,
  AttestStatus,
} from '@/types';

// ── enum decoding ─────────────────────────────────────────────────────────────
// scValToNative renders a unit enum variant as its name string (e.g. "School"), or
// occasionally a single-element array / object. Normalize to the variant name.
function enumName(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  if (raw && typeof raw === 'object') return Object.keys(raw as object)[0];
  return '';
}

const decodeByName = <T extends string>(raw: unknown, table: Record<T, number>, fallback: T): T =>
  (enumName(raw) in table ? (enumName(raw) as T) : fallback);

const decodeByIndex = <T>(raw: unknown, table: T[]): T => {
  const name = enumName(raw);
  const hit = table.find((t) => String(t) === name);
  return hit ?? table[0];
};

// ── Registry ──────────────────────────────────────────────────────────────────

export async function isRegistered(addr: string): Promise<boolean> {
  return simulateContractCall<boolean>({
    contractAddress: CONTRACT_ADDRESSES.REGISTRY,
    method: 'is_registered',
    args: [addressToScVal(addr)],
    publicKey: addr,
  });
}

export async function getUser(addr: string): Promise<UserProfile | null> {
  try {
    const raw = await simulateContractCall<Record<string, unknown>>({
      contractAddress: CONTRACT_ADDRESSES.REGISTRY,
      method: 'get_user',
      args: [addressToScVal(addr)],
      publicKey: addr,
    });
    return parseUser(raw);
  } catch {
    return null;
  }
}

export async function registerUser(publicKey: string, name: string, role: Role): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.REGISTRY,
    method: 'register',
    args: [addressToScVal(publicKey), stringToScVal(name), enumToScVal(role)],
    publicKey,
  });
}

export async function listInstitutions(): Promise<Institution[]> {
  const raw = await simulateContractCall<unknown[]>({
    contractAddress: CONTRACT_ADDRESSES.REGISTRY,
    method: 'list_institutions',
    args: [],
  });
  return (raw ?? []).map((r) => parseInstitution(r as Record<string, unknown>));
}

export async function addInstitution(
  publicKey: string,
  name: string,
  category: Category,
  payout: string
): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.REGISTRY,
    method: 'add_institution',
    args: [stringToScVal(name), enumToScVal(category), addressToScVal(payout)],
    publicKey,
  });
}

export async function setVerified(publicKey: string, id: bigint, verified: boolean): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.REGISTRY,
    method: 'set_verified',
    args: [u64ToScVal(id), boolToScVal(verified)],
    publicKey,
  });
}

// ── Attestation ─────────────────────────────────────────────────────────────

export async function attest(
  publicKey: string,
  earmarkId: bigint,
  status: AttestStatus,
  note: string
): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.ATTESTATION,
    method: 'attest',
    args: [addressToScVal(publicKey), u64ToScVal(earmarkId), enumToScVal(status), stringToScVal(note)],
    publicKey,
  });
}

export async function getAttestation(earmarkId: bigint): Promise<Attestation | null> {
  try {
    const raw = await simulateContractCall<Record<string, unknown>>({
      contractAddress: CONTRACT_ADDRESSES.ATTESTATION,
      method: 'get_attestation',
      args: [u64ToScVal(earmarkId)],
    });
    return parseAttestation(raw);
  } catch {
    return null;
  }
}

export async function isAttestor(addr: string): Promise<boolean> {
  try {
    return await simulateContractCall<boolean>({
      contractAddress: CONTRACT_ADDRESSES.ATTESTATION,
      method: 'is_attestor',
      args: [addressToScVal(addr)],
      publicKey: addr,
    });
  } catch {
    return false;
  }
}

// ── Escrow ────────────────────────────────────────────────────────────────────

export async function createEarmark(
  publicKey: string,
  recipient: string,
  mode: ReleaseMode,
  institutionId: bigint,
  amount: bigint,
  purpose: string,
  expiry: bigint
): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.ESCROW,
    method: 'create_earmark',
    args: [
      addressToScVal(publicKey),
      addressToScVal(recipient),
      enumToScVal(mode),
      u64ToScVal(institutionId),
      i128ToScVal(amount),
      stringToScVal(purpose),
      u64ToScVal(expiry),
    ],
    publicKey,
  });
}

export async function releaseEarmark(publicKey: string, earmarkId: bigint): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.ESCROW,
    method: 'release',
    args: [u64ToScVal(earmarkId)],
    publicKey,
  });
}

export async function refundEarmark(publicKey: string, earmarkId: bigint): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.ESCROW,
    method: 'refund',
    args: [u64ToScVal(earmarkId)],
    publicKey,
  });
}

export async function getEarmarkById(earmarkId: bigint): Promise<Earmark | null> {
  try {
    const raw = await simulateContractCall<Record<string, unknown>>({
      contractAddress: CONTRACT_ADDRESSES.ESCROW,
      method: 'get_earmark',
      args: [u64ToScVal(earmarkId)],
    });
    return parseEarmark(raw);
  } catch {
    return null;
  }
}

export async function getSenderEarmarks(addr: string): Promise<Earmark[]> {
  return getEarmarks('get_sender_earmarks', addr);
}

export async function getRecipientEarmarks(addr: string): Promise<Earmark[]> {
  return getEarmarks('get_recipient_earmarks', addr);
}

async function getEarmarks(method: string, addr: string): Promise<Earmark[]> {
  try {
    const raw = await simulateContractCall<unknown[]>({
      contractAddress: CONTRACT_ADDRESSES.ESCROW,
      method,
      args: [addressToScVal(addr)],
      publicKey: addr,
    });
    return (raw ?? []).map((r) => parseEarmark(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

// ── Streaming ─────────────────────────────────────────────────────────────────

export async function createStream(
  publicKey: string,
  recipient: string,
  total: bigint,
  duration: bigint,
  purpose: string
): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.STREAMING,
    method: 'create_stream',
    args: [
      addressToScVal(publicKey),
      addressToScVal(recipient),
      i128ToScVal(total),
      u64ToScVal(duration),
      stringToScVal(purpose),
    ],
    publicKey,
  });
}

export async function withdrawStream(publicKey: string, streamId: bigint): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.STREAMING,
    method: 'withdraw',
    args: [u64ToScVal(streamId)],
    publicKey,
  });
}

export async function pauseStream(publicKey: string, streamId: bigint): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.STREAMING,
    method: 'pause',
    args: [u64ToScVal(streamId)],
    publicKey,
  });
}

export async function resumeStream(publicKey: string, streamId: bigint): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.STREAMING,
    method: 'resume',
    args: [u64ToScVal(streamId)],
    publicKey,
  });
}

export async function cancelStream(publicKey: string, streamId: bigint): Promise<string> {
  return invokeContractCall({
    contractAddress: CONTRACT_ADDRESSES.STREAMING,
    method: 'cancel',
    args: [u64ToScVal(streamId)],
    publicKey,
  });
}

export async function getWithdrawable(streamId: bigint): Promise<bigint> {
  try {
    return await simulateContractCall<bigint>({
      contractAddress: CONTRACT_ADDRESSES.STREAMING,
      method: 'withdrawable',
      args: [u64ToScVal(streamId)],
    });
  } catch {
    return 0n;
  }
}

export async function getSenderStreams(addr: string): Promise<Stream[]> {
  return getStreams('get_sender_streams', addr);
}

export async function getRecipientStreams(addr: string): Promise<Stream[]> {
  return getStreams('get_recipient_streams', addr);
}

async function getStreams(method: string, addr: string): Promise<Stream[]> {
  try {
    const raw = await simulateContractCall<unknown[]>({
      contractAddress: CONTRACT_ADDRESSES.STREAMING,
      method,
      args: [addressToScVal(addr)],
      publicKey: addr,
    });
    return (raw ?? []).map((r) => parseStream(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

// ── USDC (Stellar Asset Contract) ─────────────────────────────────────────────

export async function getUsdcBalance(addr: string): Promise<bigint> {
  if (!USDC.contractId) return 0n;
  try {
    return await simulateContractCall<bigint>({
      contractAddress: USDC.contractId,
      method: 'balance',
      args: [addressToScVal(addr)],
      publicKey: addr,
    });
  } catch {
    // No trustline / no SAC entry yet → treat as zero.
    return 0n;
  }
}

// ── Parsers ───────────────────────────────────────────────────────────────────

const big = (v: unknown): bigint => BigInt((v as bigint | number | string) ?? 0);

function parseUser(raw: Record<string, unknown>): UserProfile {
  return {
    address: String(raw.address ?? ''),
    name: String(raw.name ?? ''),
    role: decodeByName<Role>(raw.role, ROLE_INDEX, 'Sender'),
    registeredAt: big(raw.registered_at),
  };
}

function parseInstitution(raw: Record<string, unknown>): Institution {
  return {
    id: big(raw.id),
    payout: String(raw.payout ?? ''),
    name: String(raw.name ?? ''),
    category: decodeByName<Category>(raw.category, CATEGORY_INDEX, 'Merchant'),
    attestor: String(raw.attestor ?? ''),
    verified: Boolean(raw.verified ?? false),
    registeredAt: big(raw.registered_at),
  };
}

function parseEarmark(raw: Record<string, unknown>): Earmark {
  return {
    id: big(raw.id),
    sender: String(raw.sender ?? ''),
    recipient: String(raw.recipient ?? ''),
    mode: decodeByIndex<ReleaseMode>(raw.mode, RELEASE_MODE_FROM_INDEX),
    institutionId: big(raw.institution_id),
    amount: big(raw.amount),
    purpose: String(raw.purpose ?? ''),
    status: decodeByIndex(raw.status, EARMARK_STATUS_FROM_INDEX),
    createdAt: big(raw.created_at),
    expiry: big(raw.expiry),
  };
}

function parseStream(raw: Record<string, unknown>): Stream {
  return {
    id: big(raw.id),
    sender: String(raw.sender ?? ''),
    recipient: String(raw.recipient ?? ''),
    total: big(raw.total),
    withdrawn: big(raw.withdrawn),
    startTs: big(raw.start_ts),
    duration: big(raw.duration),
    purpose: String(raw.purpose ?? ''),
    status: decodeByIndex(raw.status, STREAM_STATUS_FROM_INDEX),
    pausedAt: big(raw.paused_at),
    pausedAccum: big(raw.paused_accum),
  };
}

function parseAttestation(raw: Record<string, unknown>): Attestation {
  return {
    earmarkId: big(raw.earmark_id),
    attestor: String(raw.attestor ?? ''),
    status: decodeByIndex<AttestStatus>(raw.status, ATTEST_STATUS_FROM_INDEX),
    note: String(raw.note ?? ''),
    attestedAt: big(raw.attested_at),
  };
}

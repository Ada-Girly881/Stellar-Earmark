import {
  Address,
  Asset,
  Contract,
  Operation,
  SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import {
  isConnected,
  requestAccess,
  signTransaction,
  getNetworkDetails,
} from '@stellar/freighter-api';
import {
  SOROBAN_RPC_URL,
  NETWORK_PASSPHRASE,
  TX_TIMEOUT,
  BASE_FEE,
  USDC,
} from './constants';

// ── RPC server singleton ────────────────────────────────────────────────────

let _server: SorobanRpc.Server | null = null;

export function getServer(): SorobanRpc.Server {
  if (!_server) {
    _server = new SorobanRpc.Server(SOROBAN_RPC_URL, { allowHttp: true });
  }
  return _server;
}

// ── Wallet ──────────────────────────────────────────────────────────────────

export async function connectFreighter(): Promise<{ publicKey: string; network: string }> {
  let installed = false;
  try {
    const r = await isConnected();
    installed = !!r.isConnected;
  } catch {
    installed = false;
  }
  if (!installed) throw new Error('FREIGHTER_NOT_INSTALLED');

  const access = await requestAccess();
  if (access.error || !access.address) {
    const raw = (access.error ?? '').toLowerCase();
    if (raw.includes('reject') || raw.includes('denied') || raw.includes('cancel')) {
      throw new Error('Connection cancelled. Approve Earmark in the Freighter popup and try again.');
    }
    if (raw.includes('unlock') || raw.includes('locked') || raw.includes('password')) {
      throw new Error('Freighter is locked. Open the extension, enter your password, then try again.');
    }
    throw new Error(
      access.error ? `Freighter: ${access.error}` : 'Freighter did not return an address. Unlock it and retry.'
    );
  }

  const net = await getNetworkDetails();
  if (net.error) {
    throw new Error('Could not read network from Freighter. Switch it to Testnet and try again.');
  }
  return { publicKey: access.address, network: net.networkPassphrase };
}

// ── ScVal helpers ─────────────────────────────────────────────────────────────

export const addressToScVal = (a: string): xdr.ScVal => Address.fromString(a).toScVal();
export const u64ToScVal = (v: bigint | number): xdr.ScVal => nativeToScVal(BigInt(v), { type: 'u64' });
export const u32ToScVal = (v: number): xdr.ScVal => nativeToScVal(v, { type: 'u32' });
export const i128ToScVal = (v: bigint | number): xdr.ScVal => nativeToScVal(BigInt(v), { type: 'i128' });
export const stringToScVal = (v: string): xdr.ScVal => nativeToScVal(v, { type: 'string' });
export const boolToScVal = (v: boolean): xdr.ScVal => nativeToScVal(v, { type: 'bool' });

/** Encode a Rust `#[repr(u32)] enum` unit variant the way the SDK expects (a 1-symbol vec). */
export const enumToScVal = (variant: string): xdr.ScVal =>
  xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(variant)]);

// ── Contract calls ────────────────────────────────────────────────────────────

interface InvokeOptions {
  contractAddress: string;
  method: string;
  args?: xdr.ScVal[];
  publicKey: string;
}

const READONLY_CALLER = 'GDQ6QUVINBCLB3ZCA5BHDBI6E7BNJGCIDWX7WPE2F7UYSGD7P5KBPM2F';

/** Simulate a read-only call and decode the result to a native JS value. */
export async function simulateContractCall<T = unknown>(
  opts: Omit<InvokeOptions, 'publicKey'> & { publicKey?: string }
): Promise<T> {
  const server = getServer();
  const contract = new Contract(opts.contractAddress);
  const caller = opts.publicKey ?? READONLY_CALLER;

  const account = await server.getAccount(caller);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(opts.method, ...(opts.args ?? [])))
    .setTimeout(TX_TIMEOUT)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  if (!sim.result) throw new Error('No result returned from simulation');
  return scValToNative(sim.result.retval) as T;
}

/** Build → simulate → sign (Freighter) → submit → poll. Returns the tx hash. */
export async function invokeContractCall(opts: InvokeOptions): Promise<string> {
  const server = getServer();
  const contract = new Contract(opts.contractAddress);
  const account = await server.getAccount(opts.publicKey);

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(opts.method, ...(opts.args ?? [])))
    .setTimeout(TX_TIMEOUT)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }
  const prepared = SorobanRpc.assembleTransaction(tx, sim).build();
  return signSubmitPoll(prepared.toEnvelope().toXDR('base64'), opts.publicKey);
}

/**
 * Add a USDC trustline to the connected wallet via a classic `changeTrust` operation,
 * so the account can actually hold USDC. Signed by Freighter.
 */
export async function addUsdcTrustline(publicKey: string): Promise<string> {
  const server = getServer();
  const account = await server.getAccount(publicKey);
  const asset = new Asset(USDC.code, USDC.issuer);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(TX_TIMEOUT)
    .build();
  return signSubmitPoll(tx.toEnvelope().toXDR('base64'), publicKey);
}

async function signSubmitPoll(xdrString: string, publicKey: string): Promise<string> {
  const signed = await signTransaction(xdrString, {
    networkPassphrase: NETWORK_PASSPHRASE,
    address: publicKey,
  });
  if (signed.error) throw new Error(`Signing failed: ${signed.error}`);

  const server = getServer();
  const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE);
  const sent = await server.sendTransaction(signedTx);
  if (sent.status === 'ERROR') {
    throw new Error(`Transaction failed: ${JSON.stringify(sent.errorResult)}`);
  }

  const hash = sent.hash;
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const res = await server.getTransaction(hash);
    if (res.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return hash;
    if (res.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain: ${hash}`);
    }
  }
  throw new Error(`Transaction timed out: ${hash}`);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Misc ──────────────────────────────────────────────────────────────────────

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

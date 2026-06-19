'use client';
import { Wallet } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';

/** Wrap any app page; shows a connect prompt until a wallet is connected. */
export function RequireWallet({ children }: { children: (publicKey: string) => React.ReactNode }) {
  const { isConnected, publicKey, connect, status } = useWallet();

  if (!isConnected || !publicKey) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(47,214,176,0.12)' }}>
          <Wallet className="w-6 h-6" style={{ color: 'var(--teal)' }} />
        </div>
        <h2 className="h2 mb-2" style={{ fontSize: '26px' }}>Connect your wallet</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--muted)' }}>
          Earmark uses Freighter on Stellar Testnet. Connect to send, receive, and attest.
        </p>
        <button onClick={connect} disabled={status === 'connecting'} className="btn-primary mx-auto">
          <Wallet className="w-4 h-4" />
          {status === 'connecting' ? 'Connecting…' : 'Connect Freighter'}
        </button>
      </div>
    );
  }

  return <>{children(publicKey)}</>;
}

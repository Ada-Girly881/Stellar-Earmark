'use client';
import { Coins, Plus, ExternalLink } from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { formatUsdc } from '@/types';
import { USDC_FAUCET } from '@/lib/constants';

/** Shows the connected wallet's USDC balance with trustline + faucet helpers. */
export function AccountBar({ publicKey }: { publicKey: string }) {
  const { usdcBalance, addTrustline, addingTrustline } = useProfile(publicKey);
  const hasBalance = usdcBalance > 0n;

  return (
    <div className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4" style={{ padding: '18px 22px' }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(47,214,176,0.12)' }}>
          <Coins className="w-5 h-5" style={{ color: 'var(--teal)' }} />
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>Your USDC balance</div>
          <div className="stat-num" style={{ fontSize: '26px' }}>
            ${formatUsdc(usdcBalance)}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => addTrustline()} disabled={addingTrustline} className="btn-ghost" style={{ padding: '9px 14px' }}>
          <Plus className="w-3.5 h-3.5" />
          {addingTrustline ? 'Adding…' : 'Add USDC trustline'}
        </button>
        <a href={USDC_FAUCET} target="_blank" rel="noreferrer" className="btn-ghost" style={{ padding: '9px 14px' }}>
          Get test USDC <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
      {!hasBalance && (
        <p className="text-xs w-full sm:w-auto" style={{ color: 'var(--amber)' }}>
          No USDC yet? Add the trustline, then fund from the faucet.
        </p>
      )}
    </div>
  );
}

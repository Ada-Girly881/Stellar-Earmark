'use client';
import { useEffect, useState } from 'react';
import { Download, Pause, Play, XCircle } from 'lucide-react';
import type { Stream } from '@/types';
import { formatUsdc, stroopsToUsdc } from '@/types';
import { StreamBadge } from '@/components/ui/StatusBadge';
import { truncateAddress } from '@/lib/stellar';

/** Linear vesting, mirroring the contract's vested_amount(), interpolated client-side. */
function vestedNow(s: Stream): bigint {
  const now = Math.floor(Date.now() / 1000);
  let active = now - Number(s.startTs) - Number(s.pausedAccum);
  if (s.status === 'Paused') active -= now - Number(s.pausedAt);
  active = Math.max(0, active);
  const dur = Number(s.duration);
  if (active >= dur) return s.total;
  return BigInt(Math.floor((Number(s.total) * active) / dur));
}

interface Props {
  stream: Stream;
  perspective: 'sender' | 'recipient';
  onWithdraw?: (id: bigint) => void;
  onPause?: (id: bigint) => void;
  onResume?: (id: bigint) => void;
  onCancel?: (id: bigint) => void;
  busy?: boolean;
}

export function StreamCard({ stream: s, perspective, onWithdraw, onPause, onResume, onCancel, busy }: Props) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (s.status !== 'Active') return;
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [s.status]);

  const vested = vestedNow(s);
  const withdrawable = vested > s.withdrawn ? vested - s.withdrawn : 0n;
  const pct = s.total === 0n ? 0 : Math.min(100, (Number(vested) / Number(s.total)) * 100);
  const counterparty = perspective === 'sender' ? s.recipient : s.sender;
  const ended = s.status === 'Cancelled' || s.status === 'Completed';

  return (
    <div className="card" style={{ padding: '20px' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-sm mb-0.5" style={{ fontWeight: 600 }}>{s.purpose || 'Stream'}</div>
          <div className="text-xs" style={{ color: 'var(--muted)' }}>
            {perspective === 'sender' ? 'To' : 'From'} <span className="font-mono">{truncateAddress(counterparty)}</span>
          </div>
        </div>
        <StreamBadge status={s.status} />
      </div>

      {/* Progress */}
      <div className="mb-2 flex items-baseline justify-between">
        <span className="stat-num" style={{ fontSize: '20px' }}>
          ${formatUsdc(vested)}
        </span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>of ${formatUsdc(s.total)} vested</span>
      </div>
      <div className="progress-track mb-3" style={{ height: '8px' }}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-xs mb-4" style={{ color: 'var(--muted)' }}>
        <span>Withdrawn: ${formatUsdc(s.withdrawn)}</span>
        {perspective === 'recipient' && withdrawable > 0n && (
          <span style={{ color: 'var(--teal)' }}>${stroopsToUsdc(withdrawable).toFixed(4)} ready</span>
        )}
      </div>

      {!ended && (
        <div className="flex flex-wrap gap-2">
          {perspective === 'recipient' && onWithdraw && (
            <button
              onClick={() => onWithdraw(s.id)}
              disabled={busy || withdrawable === 0n}
              className="btn-primary"
              style={{ padding: '8px 14px', flex: 1 }}
            >
              <Download className="w-3.5 h-3.5" /> Withdraw
            </button>
          )}
          {perspective === 'sender' && (
            <>
              {s.status === 'Active' && onPause && (
                <button onClick={() => onPause(s.id)} disabled={busy} className="btn-ghost" style={{ padding: '8px 14px' }}>
                  <Pause className="w-3.5 h-3.5" /> Pause
                </button>
              )}
              {s.status === 'Paused' && onResume && (
                <button onClick={() => onResume(s.id)} disabled={busy} className="btn-ghost" style={{ padding: '8px 14px' }}>
                  <Play className="w-3.5 h-3.5" /> Resume
                </button>
              )}
              {onCancel && (
                <button onClick={() => onCancel(s.id)} disabled={busy} className="btn-ghost" style={{ padding: '8px 14px', color: 'var(--rose)' }}>
                  <XCircle className="w-3.5 h-3.5" /> Cancel
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

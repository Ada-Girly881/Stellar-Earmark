'use client';
import { ArrowUpRight, Building2, User } from 'lucide-react';
import type { Earmark, Institution } from '@/types';
import { formatUsdc, formatTimeLeft } from '@/types';
import { EarmarkBadge } from '@/components/ui/StatusBadge';
import { truncateAddress } from '@/lib/stellar';

interface Props {
  earmark: Earmark;
  institutions: Institution[];
  perspective: 'sender' | 'recipient';
  onRelease?: (id: bigint) => void;
  onRefund?: (id: bigint) => void;
  busy?: boolean;
}

export function EarmarkCard({ earmark: e, institutions, perspective, onRelease, onRefund, busy }: Props) {
  const inst = institutions.find((i) => i.id === e.institutionId);
  const direct = e.mode === 'DirectInstitution';
  const counterparty = perspective === 'sender' ? e.recipient : e.sender;
  const expired = Number(e.expiry) <= Math.floor(Date.now() / 1000);

  return (
    <div className="card card-hover" style={{ padding: '20px' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`badge ${direct ? 'badge-amber' : 'badge-sky'}`}>
            {direct ? <Building2 className="w-3 h-3" /> : <User className="w-3 h-3" />}
            {direct ? 'Direct-to-purpose' : 'Conditional'}
          </span>
          <EarmarkBadge status={e.status} />
        </div>
        <div className="stat-num" style={{ fontSize: '22px' }}>${formatUsdc(e.amount)}</div>
      </div>

      <div className="text-sm mb-1" style={{ color: 'var(--text)', fontWeight: 600 }}>
        {e.purpose || 'Untitled earmark'}
      </div>
      <div className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
        {direct && inst ? (
          <>Routed to <span style={{ color: 'var(--amber)' }}>{inst.name}</span></>
        ) : (
          <>
            {perspective === 'sender' ? 'To' : 'From'}{' '}
            <span className="font-mono">{truncateAddress(counterparty)}</span>
          </>
        )}
        {e.status === 'Active' && <> · {formatTimeLeft(e.expiry)}</>}
      </div>

      {e.status === 'Active' && (
        <div className="flex gap-2">
          {onRelease && (
            <button onClick={() => onRelease(e.id)} disabled={busy} className="btn-primary" style={{ padding: '8px 14px', flex: 1 }}>
              <ArrowUpRight className="w-3.5 h-3.5" /> Release
            </button>
          )}
          {onRefund && perspective === 'sender' && (
            <button
              onClick={() => onRefund(e.id)}
              disabled={busy || !expired}
              title={expired ? 'Reclaim funds' : 'Available after expiry, or if the condition is rejected'}
              className="btn-ghost"
              style={{ padding: '8px 14px' }}
            >
              Refund
            </button>
          )}
        </div>
      )}
    </div>
  );
}

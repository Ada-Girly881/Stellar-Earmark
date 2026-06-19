'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Search, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { RequireWallet } from '@/components/app/RequireWallet';
import { useAttestation } from '@/hooks/useAttestation';
import { useInstitutions } from '@/hooks/useInstitutions';
import { getEarmarkById, getAttestation } from '@/lib/contracts';
import { formatUsdc, formatTimeLeft } from '@/types';
import { truncateAddress } from '@/lib/stellar';

export default function AttestPage() {
  return <RequireWallet>{(pk) => <AttestInner publicKey={pk} />}</RequireWallet>;
}

function AttestInner({ publicKey }: { publicKey: string }) {
  const qc = useQueryClient();
  const { isAttestor, attest, isAttesting } = useAttestation(publicKey);
  const { institutions } = useInstitutions();
  const [idInput, setIdInput] = useState('');
  const [note, setNote] = useState('');
  const [lookupId, setLookupId] = useState<bigint | null>(null);

  const { data: earmark, isFetching } = useQuery({
    queryKey: ['attest-earmark', lookupId?.toString()],
    queryFn: () => (lookupId !== null ? getEarmarkById(lookupId) : null),
    enabled: lookupId !== null,
  });

  const { data: existing } = useQuery({
    queryKey: ['attest-existing', lookupId?.toString()],
    queryFn: () => (lookupId !== null ? getAttestation(lookupId) : null),
    enabled: lookupId !== null,
  });

  const inst = earmark ? institutions.find((i) => i.id === earmark.institutionId) : undefined;

  const doAttest = async (status: 'Confirmed' | 'Rejected') => {
    if (lookupId === null) return;
    await attest({ earmarkId: lookupId, status, note: note || (status === 'Confirmed' ? 'Condition verified' : 'Not verified') });
    // Refresh the lookup so the result panel reflects the new attestation immediately.
    setTimeout(() => {
      qc.invalidateQueries({ queryKey: ['attest-existing', lookupId.toString()] });
      qc.invalidateQueries({ queryKey: ['attest-earmark', lookupId.toString()] });
    }, 2500);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6">
        <h1 className="h2">Attestation portal</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          The last mile. A verified institution or oracle confirms a real-world condition — enrollment,
          an invoice, rent received — and the escrow releases. This is what makes &quot;strings attached&quot; trustworthy.
        </p>
      </div>

      {/* Attestor status */}
      <div className="card flex items-center gap-3 mb-6" style={{ padding: '16px 20px' }}>
        {isAttestor ? (
          <>
            <BadgeCheck className="w-5 h-5" style={{ color: 'var(--teal)' }} />
            <div>
              <div className="text-sm font-semibold">You&apos;re an authorized attestor</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>{truncateAddress(publicKey)} can confirm or reject conditions.</div>
            </div>
          </>
        ) : (
          <>
            <ShieldAlert className="w-5 h-5" style={{ color: 'var(--amber)' }} />
            <div>
              <div className="text-sm font-semibold">Not an authorized attestor</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                Only allowlisted institution/oracle keys can attest. You can still look up an earmark below.
              </div>
            </div>
          </>
        )}
      </div>

      {/* Lookup */}
      <div className="card mb-6" style={{ padding: '20px' }}>
        <label className="label">Earmark ID</label>
        <div className="flex gap-2">
          <input
            className="field"
            type="number"
            min="1"
            placeholder="e.g. 1"
            value={idInput}
            onChange={(e) => setIdInput(e.target.value)}
          />
          <button
            onClick={() => idInput && setLookupId(BigInt(idInput))}
            className="btn-ghost"
            style={{ padding: '10px 16px' }}
          >
            <Search className="w-4 h-4" /> Look up
          </button>
        </div>
      </div>

      {/* Result */}
      {isFetching && <div className="text-sm" style={{ color: 'var(--muted)' }}>Loading earmark…</div>}

      {lookupId !== null && !isFetching && !earmark && (
        <div className="card text-center py-10">
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No earmark found with id {lookupId.toString()}.</p>
        </div>
      )}

      {earmark && (
        <div className="card" style={{ padding: '24px' }}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-sm font-semibold mb-0.5">{earmark.purpose || 'Untitled earmark'}</div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>
                {earmark.mode === 'DirectInstitution' && inst ? `Direct → ${inst.name}` : `Conditional → ${truncateAddress(earmark.recipient)}`}
              </div>
            </div>
            <div className="stat-num" style={{ fontSize: '24px' }}>${formatUsdc(earmark.amount)}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs mb-5">
            <Field label="Status" value={earmark.status} />
            <Field label="From" value={truncateAddress(earmark.sender)} mono />
            <Field label="Expiry" value={formatTimeLeft(earmark.expiry)} />
            <Field label="Earmark ID" value={earmark.id.toString()} />
          </div>

          {existing ? (
            <div
              className="card-2 flex items-center gap-3"
              style={{ padding: '16px', borderColor: existing.status === 'Confirmed' ? 'var(--teal)' : 'var(--rose)' }}
            >
              {existing.status === 'Confirmed' ? (
                <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--teal)' }} />
              ) : (
                <XCircle className="w-5 h-5" style={{ color: 'var(--rose)' }} />
              )}
              <div>
                <div className="text-sm font-semibold">Already {existing.status.toLowerCase()}</div>
                {existing.note && <div className="text-xs" style={{ color: 'var(--muted)' }}>&quot;{existing.note}&quot;</div>}
              </div>
            </div>
          ) : earmark.status !== 'Active' ? (
            <p className="text-xs" style={{ color: 'var(--muted)' }}>This earmark is {earmark.status.toLowerCase()} — nothing to attest.</p>
          ) : isAttestor ? (
            <>
              <label className="label">Note (optional)</label>
              <input
                className="field mb-3"
                maxLength={100}
                placeholder="Enrollment confirmed for Term 2"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => doAttest('Confirmed')} disabled={isAttesting} className="btn-primary" style={{ flex: 1, padding: '11px' }}>
                  <CheckCircle2 className="w-4 h-4" /> Confirm condition
                </button>
                <button
                  onClick={() => doAttest('Rejected')}
                  disabled={isAttesting}
                  className="btn-ghost"
                  style={{ padding: '11px 16px', color: 'var(--rose)' }}
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            </>
          ) : (
            <p className="text-xs" style={{ color: 'var(--amber)' }}>
              Connect with an authorized attestor key to confirm or reject this condition.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="card-2" style={{ padding: '10px 12px' }}>
      <div style={{ color: 'var(--muted)' }}>{label}</div>
      <div className={mono ? 'font-mono' : ''} style={{ color: 'var(--text)', fontWeight: 600, marginTop: '2px' }}>{value}</div>
    </div>
  );
}

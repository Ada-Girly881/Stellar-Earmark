'use client';
import { useState } from 'react';
import { Plus, Send as SendIcon } from 'lucide-react';
import { RequireWallet } from '@/components/app/RequireWallet';
import { AccountBar } from '@/components/app/AccountBar';
import { CreateModal } from '@/components/app/CreateModal';
import { EarmarkCard } from '@/components/app/EarmarkCard';
import { StreamCard } from '@/components/app/StreamCard';
import { useEarmarks } from '@/hooks/useEarmarks';
import { useStreams } from '@/hooks/useStreams';
import { useInstitutions } from '@/hooks/useInstitutions';

export default function SendPage() {
  return <RequireWallet>{(pk) => <SendInner publicKey={pk} />}</RequireWallet>;
}

function SendInner({ publicKey }: { publicKey: string }) {
  const [open, setOpen] = useState(false);
  const earmarks = useEarmarks(publicKey);
  const streams = useStreams(publicKey);
  const { institutions } = useInstitutions();

  const activeEarmarks = earmarks.sent;
  const activeStreams = streams.sent;
  const empty = activeEarmarks.length === 0 && activeStreams.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="h2">Send</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Attach conditions, stream support, or route funds straight to purpose.
          </p>
        </div>
        <button onClick={() => setOpen(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New earmark
        </button>
      </div>

      <div className="mb-8">
        <AccountBar publicKey={publicKey} />
      </div>

      {empty ? (
        <EmptyState onCreate={() => setOpen(true)} />
      ) : (
        <div className="space-y-8">
          {activeStreams.length > 0 && (
            <Section title="Streams" count={activeStreams.length}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeStreams.map((s) => (
                  <StreamCard
                    key={s.id.toString()}
                    stream={s}
                    perspective="sender"
                    onPause={streams.pause}
                    onResume={streams.resume}
                    onCancel={streams.cancel}
                  />
                ))}
              </div>
            </Section>
          )}
          {activeEarmarks.length > 0 && (
            <Section title="Conditional & direct-to-purpose" count={activeEarmarks.length}>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeEarmarks.map((e) => (
                  <EarmarkCard
                    key={e.id.toString()}
                    earmark={e}
                    institutions={institutions}
                    perspective="sender"
                    onRefund={earmarks.refund}
                    busy={earmarks.isRefunding}
                  />
                ))}
              </div>
            </Section>
          )}
        </div>
      )}

      <CreateModal open={open} onClose={() => setOpen(false)} publicKey={publicKey} institutions={institutions} />
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="h3">{title}</h2>
        <span className="badge badge-muted">{count}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="card text-center py-16" style={{ padding: '48px 24px' }}>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(47,214,176,0.12)' }}>
        <SendIcon className="w-5 h-5" style={{ color: 'var(--teal)' }} />
      </div>
      <h3 className="h3 mb-2">No earmarks yet</h3>
      <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: 'var(--muted)' }}>
        Create your first conditional remittance, streaming drip, or direct-to-purpose payout.
      </p>
      <button onClick={onCreate} className="btn-primary mx-auto">
        <Plus className="w-4 h-4" /> New earmark
      </button>
    </div>
  );
}

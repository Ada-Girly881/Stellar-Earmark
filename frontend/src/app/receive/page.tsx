'use client';
import { Inbox } from 'lucide-react';
import { RequireWallet } from '@/components/app/RequireWallet';
import { AccountBar } from '@/components/app/AccountBar';
import { EarmarkCard } from '@/components/app/EarmarkCard';
import { StreamCard } from '@/components/app/StreamCard';
import { useEarmarks } from '@/hooks/useEarmarks';
import { useStreams } from '@/hooks/useStreams';
import { useInstitutions } from '@/hooks/useInstitutions';

export default function ReceivePage() {
  return <RequireWallet>{(pk) => <ReceiveInner publicKey={pk} />}</RequireWallet>;
}

function ReceiveInner({ publicKey }: { publicKey: string }) {
  const earmarks = useEarmarks(publicKey);
  const streams = useStreams(publicKey);
  const { institutions } = useInstitutions();

  const incomingEarmarks = earmarks.received;
  const incomingStreams = streams.received;
  const empty = incomingEarmarks.length === 0 && incomingStreams.length === 0;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-6">
        <h1 className="h2">Receive</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Funds people have earmarked for you. Withdraw streams as they vest; conditional earmarks
          release automatically once their condition is confirmed.
        </p>
      </div>

      <div className="mb-8">
        <AccountBar publicKey={publicKey} />
      </div>

      {empty ? (
        <div className="card text-center py-16" style={{ padding: '48px 24px' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(91,184,255,0.12)' }}>
            <Inbox className="w-5 h-5" style={{ color: 'var(--sky)' }} />
          </div>
          <h3 className="h3 mb-2">Nothing incoming yet</h3>
          <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--muted)' }}>
            When someone sends you an earmark or stream, it shows up here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {incomingStreams.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="h3">Streams</h2>
                <span className="badge badge-muted">{incomingStreams.length}</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {incomingStreams.map((s) => (
                  <StreamCard
                    key={s.id.toString()}
                    stream={s}
                    perspective="recipient"
                    onWithdraw={streams.withdraw}
                  />
                ))}
              </div>
            </div>
          )}
          {incomingEarmarks.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="h3">Conditional earmarks</h2>
                <span className="badge badge-muted">{incomingEarmarks.length}</span>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {incomingEarmarks.map((e) => (
                  <EarmarkCard
                    key={e.id.toString()}
                    earmark={e}
                    institutions={institutions}
                    perspective="recipient"
                    onRelease={earmarks.release}
                    busy={earmarks.isReleasing}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

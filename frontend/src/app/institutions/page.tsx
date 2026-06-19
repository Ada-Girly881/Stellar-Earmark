'use client';
import { BadgeCheck, Building2 } from 'lucide-react';
import { useInstitutions } from '@/hooks/useInstitutions';
import { CATEGORY_META } from '@/types';
import { truncateAddress } from '@/lib/stellar';
import { EXPLORER } from '@/lib/constants';

export default function InstitutionsPage() {
  const { institutions, isLoading } = useInstitutions();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-7">
        <h1 className="h2">Verified institutions</h1>
        <p className="text-sm mt-1 max-w-2xl" style={{ color: 'var(--muted)' }}>
          Schools, clinics, landlords and utilities that funds can be routed to directly. Verification
          is the moat — only verified institutions can receive direct-to-purpose earmarks, and their
          designated attestor confirms conditions on-chain.
        </p>
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card" style={{ padding: '22px', height: '150px', opacity: 0.4 }} />
          ))}
        </div>
      ) : institutions.length === 0 ? (
        <div className="card text-center py-16" style={{ padding: '48px 24px' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(255,197,92,0.12)' }}>
            <Building2 className="w-5 h-5" style={{ color: 'var(--amber)' }} />
          </div>
          <h3 className="h3 mb-2">No institutions yet</h3>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Run <code className="font-mono" style={{ color: 'var(--text)' }}>./scripts/seed.sh</code> to add demo institutions.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {institutions.map((i) => {
            const meta = CATEGORY_META[i.category];
            return (
              <div key={i.id.toString()} className="card card-hover" style={{ padding: '22px' }}>
                <div className="flex items-start justify-between mb-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                    style={{ background: `${meta.color}16` }}
                  >
                    {meta.emoji}
                  </div>
                  {i.verified ? (
                    <span className="badge badge-teal"><BadgeCheck className="w-3 h-3" /> Verified</span>
                  ) : (
                    <span className="badge badge-muted">Pending</span>
                  )}
                </div>
                <div className="h3 mb-1" style={{ fontSize: '15px' }}>{i.name}</div>
                <div className="text-xs mb-3" style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</div>
                <a
                  href={`${EXPLORER}/account/${i.payout}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-mono hover:underline"
                  style={{ color: 'var(--muted)' }}
                >
                  Payout {truncateAddress(i.payout)} ↗
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

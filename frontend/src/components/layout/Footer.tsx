import { CONTRACT_ADDRESSES, EXPLORER } from '@/lib/constants';

export function Footer() {
  const links: { label: string; id: string }[] = [
    { label: 'Escrow', id: CONTRACT_ADDRESSES.ESCROW },
    { label: 'Streaming', id: CONTRACT_ADDRESSES.STREAMING },
    { label: 'Registry', id: CONTRACT_ADDRESSES.REGISTRY },
    { label: 'Attestation', id: CONTRACT_ADDRESSES.ATTESTATION },
  ];
  return (
    <footer style={{ borderTop: '1px solid var(--liner)', background: 'var(--card)' }} className="mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row justify-between gap-6">
          <div>
            <div className="font-display" style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: '16px' }}>
              Ear<span style={{ color: 'var(--teal)' }}>mark</span>
            </div>
            <p className="text-xs mt-2 max-w-xs" style={{ color: 'var(--muted)' }}>
              Conditional remittances on Stellar, settled in real USDC. Non-custodial escrow,
              streaming, and direct-to-purpose payouts.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs" style={{ color: 'var(--muted)' }}>
            {links.map((l) =>
              l.id ? (
                <a
                  key={l.label}
                  href={`${EXPLORER}/contract/${l.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-text transition-colors"
                >
                  {l.label} contract ↗
                </a>
              ) : null
            )}
          </div>
        </div>
        <div className="mt-8 pt-6 text-xs flex flex-col sm:flex-row justify-between gap-2"
          style={{ borderTop: '1px solid var(--liner)', color: 'var(--muted)' }}>
          <span>Built on Stellar Soroban · Testnet</span>
          <span>Settled in USDC</span>
        </div>
      </div>
    </footer>
  );
}

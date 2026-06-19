'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Send, Inbox, Building2, BadgeCheck, Wallet } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { truncateAddress } from '@/lib/stellar';

const NAV = [
  { href: '/send', label: 'Send', icon: Send },
  { href: '/receive', label: 'Receive', icon: Inbox },
  { href: '/institutions', label: 'Institutions', icon: Building2 },
  { href: '/attest', label: 'Attest', icon: BadgeCheck },
];

export function Header() {
  const pathname = usePathname();
  const { isConnected, publicKey, status, connect, disconnect } = useWallet();

  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: 'rgba(7,11,18,0.85)', backdropFilter: 'blur(18px)', borderBottom: '1px solid var(--liner)' }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--teal), var(--sky))' }}
            >
              <span style={{ color: '#04231d', fontWeight: 800, fontFamily: "'Sora',sans-serif" }}>E</span>
            </div>
            <span
              className="font-display tracking-tight"
              style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: '17px', letterSpacing: '-0.5px' }}
            >
              Ear<span style={{ color: 'var(--teal)' }}>mark</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + '/');
              return (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition-colors"
                  style={{
                    fontSize: '13px',
                    fontWeight: active ? 700 : 600,
                    fontFamily: "'Sora',sans-serif",
                    color: active ? 'var(--teal)' : 'var(--muted)',
                    background: active ? 'rgba(47,214,176,0.1)' : 'transparent',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Wallet */}
          <div className="flex items-center gap-2">
            {isConnected && publicKey ? (
              <>
                <div
                  className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl"
                  style={{ background: 'rgba(47,214,176,0.1)', border: '1px solid rgba(47,214,176,0.25)' }}
                >
                  <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: 'var(--teal)' }} />
                  <span className="text-xs font-mono" style={{ color: 'var(--teal)' }}>
                    {truncateAddress(publicKey)}
                  </span>
                </div>
                <button onClick={disconnect} className="btn-ghost" style={{ padding: '8px 14px' }}>
                  Disconnect
                </button>
              </>
            ) : (
              <button onClick={connect} disabled={status === 'connecting'} className="btn-primary">
                <Wallet className="w-4 h-4" />
                {status === 'connecting' ? 'Connecting…' : 'Connect'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      <nav className="md:hidden" style={{ borderTop: '1px solid var(--liner)' }}>
        <div className="flex items-center justify-around px-2 py-1.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs"
                style={{ color: active ? 'var(--teal)' : 'var(--muted)', fontWeight: active ? 700 : 500 }}
              >
                <Icon className="w-5 h-5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

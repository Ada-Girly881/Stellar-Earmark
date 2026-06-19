'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight, ShieldCheck, Waves, Building2, Lock, Globe, CheckCircle2,
  Send, BadgeCheck, Wallet,
} from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';

const PILLARS = [
  {
    icon: ShieldCheck,
    color: 'var(--teal)',
    title: 'Conditional release',
    desc: 'Funds unlock only when a verifiable condition is met — a school confirms enrollment, a clinic issues an invoice. Held by code, not a company.',
  },
  {
    icon: Waves,
    color: 'var(--sky)',
    title: 'Streaming support',
    desc: "Send a daily or weekly drip instead of one lump sum, so a month's support actually lasts a month. Pause, resume, or redirect anytime.",
  },
  {
    icon: Building2,
    color: 'var(--amber)',
    title: 'Direct-to-purpose',
    desc: 'Route funds straight to a verified school, landlord or clinic — bypassing the temptation of cash, while keeping a flexible portion for the recipient.',
  },
];

const STEPS = [
  { icon: Wallet, title: 'Connect & fund', desc: 'Link Freighter, add a USDC trustline, and top up with testnet USDC.' },
  { icon: Send, title: 'Create an earmark', desc: 'Pick conditional, streaming, or direct-to-purpose. Funds lock in escrow.' },
  { icon: BadgeCheck, title: 'Condition is attested', desc: 'A verified institution or oracle confirms the real-world condition on-chain.' },
  { icon: CheckCircle2, title: 'Funds settle', desc: 'USDC releases to the recipient or institution — fast, low-fee, transparent.' },
];

const WHY = [
  'Programmable escrow without an intermediary — no one can freeze, skim, or fold',
  'Corridor-agnostic: the same contract works US→Mexico, UK→Nigeria, Gulf→South Asia',
  'Verifiable conditions both parties can independently confirm',
  'Settled in real USDC on Stellar — fractions of a cent per transaction',
];

export default function Landing() {
  const { isConnected, connect, status } = useWallet();

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden pt-20 pb-24">
        <div className="hero-glow absolute inset-0 pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 relative text-center">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-7 eyebrow"
              style={{ background: 'rgba(47,214,176,0.1)', color: 'var(--teal)', border: '1px solid rgba(47,214,176,0.22)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: 'var(--teal)' }} />
              Live on Stellar Testnet · Real USDC
            </div>

            <h1 className="h1 mb-5">
              Send money home,<br />
              <span style={{ color: 'var(--teal)' }}>with strings attached</span>
            </h1>

            <p className="max-w-xl mx-auto mb-9 text-base" style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
              Remittances are a $900B lifeline — but senders lose all control the moment funds land.
              Earmark lets you attach conditions, stream support over time, or route money straight to
              a verified school or clinic. All on-chain, settled in USDC.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {isConnected ? (
                <Link href="/send">
                  <button className="btn-primary" style={{ padding: '13px 26px' }}>
                    Open the app <ArrowRight className="w-4 h-4" />
                  </button>
                </Link>
              ) : (
                <button onClick={connect} disabled={status === 'connecting'} className="btn-primary" style={{ padding: '13px 26px' }}>
                  <Wallet className="w-4 h-4" />
                  {status === 'connecting' ? 'Connecting…' : 'Connect wallet to start'}
                </button>
              )}
              <Link href="/institutions">
                <button className="btn-ghost" style={{ padding: '13px 22px' }}>
                  <Building2 className="w-4 h-4" /> Browse institutions
                </button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Three pillars */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-8">
        <div className="grid md:grid-cols-3 gap-5">
          {PILLARS.map(({ icon: Icon, color, title, desc }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="card card-hover"
              style={{ padding: '26px' }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: `${color}18` }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <h3 className="h3 mb-2">{title}</h3>
              <p className="text-sm" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="h2 mb-3">How it works</h2>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>From lump sum to last mile, on-chain.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
              className="card-2 relative"
              style={{ padding: '22px' }}
            >
              <div className="absolute top-4 right-5 stat-num" style={{ fontSize: '28px', color: 'rgba(255,255,255,0.06)' }}>
                {i + 1}
              </div>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: 'rgba(47,214,176,0.12)' }}>
                <Icon className="w-5 h-5" style={{ color: 'var(--teal)' }} />
              </div>
              <h3 className="h3 mb-1.5" style={{ fontSize: '15px' }}>{title}</h3>
              <p className="text-xs" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Why on-chain */}
      <section style={{ background: 'var(--card)', borderTop: '1px solid var(--liner)', borderBottom: '1px solid var(--liner)' }} className="py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="h2 mb-4">Why this has to be on-chain</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
              Traditional remittance startups die building corridor-by-corridor banking relationships.
              An on-chain rail inherits global reach by default — and only smart contracts can hold,
              release, and prove conditions without a middleman.
            </p>
            <ul className="space-y-3">
              {WHY.map((w) => (
                <li key={w} className="flex items-start gap-2.5 text-sm">
                  <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(47,214,176,0.14)' }}>
                    <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--teal)' }} />
                  </div>
                  <span style={{ color: 'var(--text)' }}>{w}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Lock, label: 'Non-custodial', desc: 'No one holds your funds', color: 'var(--teal)' },
              { icon: Globe, label: 'Corridor-agnostic', desc: 'Works across borders', color: 'var(--sky)' },
              { icon: ShieldCheck, label: 'Verifiable', desc: 'Conditions proven on-chain', color: 'var(--amber)' },
              { icon: Waves, label: 'Programmable', desc: 'Escrow & streaming by code', color: 'var(--indigo)' },
            ].map(({ icon: Icon, label, desc, color }) => (
              <div key={label} className="card" style={{ padding: '20px' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${color}16` }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div className="font-bold text-xs mb-1" style={{ fontFamily: "'Sora',sans-serif" }}>{label}</div>
                <div className="text-xs" style={{ color: 'var(--muted)' }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20 text-center">
        <h2 className="h2 mb-3">Try it on testnet</h2>
        <p className="text-sm mb-7 max-w-md mx-auto" style={{ color: 'var(--muted)', lineHeight: 1.7 }}>
          Connect Freighter, grab free testnet USDC, and create your first conditional remittance in
          under two minutes.
        </p>
        {isConnected ? (
          <Link href="/send">
            <button className="btn-primary" style={{ padding: '13px 26px' }}>
              Create an earmark <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        ) : (
          <button onClick={connect} className="btn-primary" style={{ padding: '13px 26px' }}>
            <Wallet className="w-4 h-4" /> Connect wallet
          </button>
        )}
      </section>
    </div>
  );
}

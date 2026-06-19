'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, Waves, Building2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { useEarmarks } from '@/hooks/useEarmarks';
import { useStreams } from '@/hooks/useStreams';
import type { Institution } from '@/types';
import { usdcToStroops, CATEGORY_META } from '@/types';

type Tab = 'conditional' | 'direct' | 'stream';

const TABS: { key: Tab; label: string; icon: typeof ShieldCheck; color: string }[] = [
  { key: 'conditional', label: 'Conditional', icon: ShieldCheck, color: 'var(--sky)' },
  { key: 'direct', label: 'Direct-to-purpose', icon: Building2, color: 'var(--amber)' },
  { key: 'stream', label: 'Stream', icon: Waves, color: 'var(--teal)' },
];

const DURATIONS = [
  { label: '1 day', secs: 86_400 },
  { label: '1 week', secs: 604_800 },
  { label: '30 days', secs: 2_592_000 },
];

export function CreateModal({
  open,
  onClose,
  publicKey,
  institutions,
}: {
  open: boolean;
  onClose: () => void;
  publicKey: string;
  institutions: Institution[];
}) {
  const [tab, setTab] = useState<Tab>('conditional');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [institutionId, setInstitutionId] = useState<string>(institutions[0]?.id.toString() ?? '');
  const [expiryDays, setExpiryDays] = useState(7);
  const [durationSecs, setDurationSecs] = useState(604_800);

  const earmarks = useEarmarks(publicKey);
  const streams = useStreams(publicKey);
  const busy = earmarks.isCreating || streams.isCreating;

  const verified = institutions.filter((i) => i.verified);

  // Default the institution dropdown once verified institutions have loaded.
  useEffect(() => {
    if (!institutionId && verified.length > 0) setInstitutionId(verified[0].id.toString());
  }, [verified, institutionId]);

  const reset = () => {
    setRecipient(''); setAmount(''); setPurpose('');
  };

  const submit = async () => {
    const amt = usdcToStroops(parseFloat(amount));
    try {
      if (tab === 'stream') {
        await streams.create({ recipient, total: amt, duration: BigInt(durationSecs), purpose });
      } else if (tab === 'direct') {
        const expiry = BigInt(Math.floor(Date.now() / 1000) + expiryDays * 86_400);
        await earmarks.create({
          recipient: recipient || institutions.find((i) => i.id.toString() === institutionId)?.payout || '',
          mode: 'DirectInstitution',
          institutionId: BigInt(institutionId),
          amount: amt,
          purpose,
          expiry,
        });
      } else {
        const expiry = BigInt(Math.floor(Date.now() / 1000) + expiryDays * 86_400);
        await earmarks.create({
          recipient,
          mode: 'ConditionalRecipient',
          institutionId: 0n,
          amount: amt,
          purpose,
          expiry,
        });
      }
      reset();
      onClose();
    } catch {
      /* toast handled in hook */
    }
  };

  const amountValid = parseFloat(amount) > 0;
  const needsRecipient = tab !== 'direct';
  const canSubmit =
    amountValid &&
    (tab === 'direct' ? !!institutionId : recipient.startsWith('G') && recipient.length === 56);

  return (
    <Modal open={open} onClose={onClose} title="New earmark">
      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {TABS.map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="card-2 flex flex-col items-center gap-1.5 py-3 transition-all"
            style={{
              borderColor: tab === key ? color : 'var(--liner)',
              background: tab === key ? `${color}12` : 'var(--card-2)',
            }}
          >
            <Icon className="w-4 h-4" style={{ color: tab === key ? color : 'var(--muted)' }} />
            <span className="text-xs font-semibold text-center" style={{ color: tab === key ? 'var(--text)' : 'var(--muted)' }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === 'direct' ? (
          <div>
            <label className="label">Verified institution</label>
            <select className="field" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
              {verified.length === 0 && <option value="">No verified institutions yet</option>}
              {verified.map((i) => (
                <option key={i.id.toString()} value={i.id.toString()}>
                  {CATEGORY_META[i.category].emoji} {i.name} · {i.category}
                </option>
              ))}
            </select>
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
              Funds release straight to this institution&apos;s payout address once the condition is confirmed.
            </p>
          </div>
        ) : null}

        {needsRecipient && (
          <div>
            <label className="label">Recipient address</label>
            <input
              className="field font-mono"
              style={{ fontSize: '13px' }}
              placeholder="G…"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
            />
          </div>
        )}

        <div>
          <label className="label">Amount (USDC)</label>
          <input
            className="field"
            type="number"
            min="0"
            step="0.01"
            placeholder="100.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div>
          <label className="label">Purpose / memo</label>
          <input
            className="field"
            maxLength={100}
            placeholder={tab === 'stream' ? 'Monthly living support' : 'School fees — Term 2'}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
        </div>

        {tab === 'stream' ? (
          <div>
            <label className="label">Drip duration</label>
            <div className="grid grid-cols-3 gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.secs}
                  onClick={() => setDurationSecs(d.secs)}
                  className="card-2 py-2 text-xs font-semibold"
                  style={{
                    borderColor: durationSecs === d.secs ? 'var(--teal)' : 'var(--liner)',
                    color: durationSecs === d.secs ? 'var(--teal)' : 'var(--muted)',
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <label className="label">Refund window (expiry)</label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 7, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setExpiryDays(d)}
                  className="card-2 py-2 text-xs font-semibold"
                  style={{
                    borderColor: expiryDays === d ? 'var(--sky)' : 'var(--liner)',
                    color: expiryDays === d ? 'var(--sky)' : 'var(--muted)',
                  }}
                >
                  {d} day{d > 1 ? 's' : ''}
                </button>
              ))}
            </div>
            <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
              If the condition isn&apos;t met by then, you can refund yourself.
            </p>
          </div>
        )}

        <button onClick={submit} disabled={!canSubmit || busy} className="btn-primary w-full" style={{ padding: '12px' }}>
          {busy ? 'Confirming in wallet…' : `Lock $${amount || '0'} in escrow`}
        </button>
      </div>
    </Modal>
  );
}

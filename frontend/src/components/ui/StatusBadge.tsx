import type { EarmarkStatus, StreamStatus } from '@/types';

const EARMARK: Record<EarmarkStatus, { cls: string; label: string }> = {
  Active: { cls: 'badge-sky', label: 'Active' },
  Released: { cls: 'badge-teal', label: 'Released' },
  Refunded: { cls: 'badge-muted', label: 'Refunded' },
};

const STREAM: Record<StreamStatus, { cls: string; label: string }> = {
  Active: { cls: 'badge-teal', label: 'Streaming' },
  Paused: { cls: 'badge-amber', label: 'Paused' },
  Cancelled: { cls: 'badge-muted', label: 'Cancelled' },
  Completed: { cls: 'badge-sky', label: 'Completed' },
};

export function EarmarkBadge({ status }: { status: EarmarkStatus }) {
  const m = EARMARK[status];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

export function StreamBadge({ status }: { status: StreamStatus }) {
  const m = STREAM[status];
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

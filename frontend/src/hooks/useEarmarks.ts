'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createEarmark,
  releaseEarmark,
  refundEarmark,
  getSenderEarmarks,
  getRecipientEarmarks,
} from '@/lib/contracts';
import { POLL_INTERVAL_MS } from '@/lib/constants';
import type { ReleaseMode } from '@/types';

export interface NewEarmark {
  recipient: string;
  mode: ReleaseMode;
  institutionId: bigint;
  amount: bigint;
  purpose: string;
  expiry: bigint;
}

export function useEarmarks(publicKey: string | null) {
  const qc = useQueryClient();

  const { data: sent = [], isLoading: loadingSent } = useQuery({
    queryKey: ['earmarks-sent', publicKey],
    queryFn: () => getSenderEarmarks(publicKey!),
    enabled: !!publicKey,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: received = [], isLoading: loadingReceived } = useQuery({
    queryKey: ['earmarks-received', publicKey],
    queryFn: () => getRecipientEarmarks(publicKey!),
    enabled: !!publicKey,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['earmarks-sent', publicKey] });
    qc.invalidateQueries({ queryKey: ['earmarks-received', publicKey] });
    qc.invalidateQueries({ queryKey: ['usdc', publicKey] });
  };

  const create = useMutation({
    mutationFn: async (e: NewEarmark) => {
      if (!publicKey) throw new Error('Wallet not connected');
      return createEarmark(publicKey, e.recipient, e.mode, e.institutionId, e.amount, e.purpose, e.expiry);
    },
    onSuccess: () => {
      toast.success('Earmark created — funds locked in escrow');
      invalidate();
    },
    onError: (e) => toast.error(`Failed: ${msg(e)}`),
  });

  const release = useMutation({
    mutationFn: async (id: bigint) => {
      if (!publicKey) throw new Error('Wallet not connected');
      return releaseEarmark(publicKey, id);
    },
    onSuccess: () => {
      toast.success('Earmark released');
      invalidate();
    },
    onError: (e) => toast.error(`Release failed: ${msg(e)}`),
  });

  const refund = useMutation({
    mutationFn: async (id: bigint) => {
      if (!publicKey) throw new Error('Wallet not connected');
      return refundEarmark(publicKey, id);
    },
    onSuccess: () => {
      toast.success('Earmark refunded');
      invalidate();
    },
    onError: (e) => toast.error(`Refund failed: ${msg(e)}`),
  });

  return {
    sent,
    received,
    isLoading: loadingSent || loadingReceived,
    create: create.mutateAsync,
    isCreating: create.isPending,
    release: release.mutateAsync,
    isReleasing: release.isPending,
    refund: refund.mutateAsync,
    isRefunding: refund.isPending,
  };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error');

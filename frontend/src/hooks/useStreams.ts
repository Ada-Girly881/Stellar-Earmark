'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createStream,
  withdrawStream,
  pauseStream,
  resumeStream,
  cancelStream,
  getSenderStreams,
  getRecipientStreams,
} from '@/lib/contracts';
import { POLL_INTERVAL_MS } from '@/lib/constants';

export interface NewStream {
  recipient: string;
  total: bigint;
  duration: bigint; // seconds
  purpose: string;
}

export function useStreams(publicKey: string | null) {
  const qc = useQueryClient();

  const { data: sent = [], isLoading: loadingSent } = useQuery({
    queryKey: ['streams-sent', publicKey],
    queryFn: () => getSenderStreams(publicKey!),
    enabled: !!publicKey,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: received = [], isLoading: loadingReceived } = useQuery({
    queryKey: ['streams-received', publicKey],
    queryFn: () => getRecipientStreams(publicKey!),
    enabled: !!publicKey,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['streams-sent', publicKey] });
    qc.invalidateQueries({ queryKey: ['streams-received', publicKey] });
    qc.invalidateQueries({ queryKey: ['usdc', publicKey] });
  };

  const create = useMutation({
    mutationFn: async (s: NewStream) => {
      if (!publicKey) throw new Error('Wallet not connected');
      return createStream(publicKey, s.recipient, s.total, s.duration, s.purpose);
    },
    onSuccess: () => {
      toast.success('Stream started — funds locked, dripping to recipient');
      invalidate();
    },
    onError: (e) => toast.error(`Failed: ${msg(e)}`),
  });

  const withdraw = useStreamAction(publicKey, withdrawStream, 'Withdrawn', invalidate);
  const pause = useStreamAction(publicKey, pauseStream, 'Stream paused', invalidate);
  const resume = useStreamAction(publicKey, resumeStream, 'Stream resumed', invalidate);
  const cancel = useStreamAction(publicKey, cancelStream, 'Stream cancelled', invalidate);

  return {
    sent,
    received,
    isLoading: loadingSent || loadingReceived,
    create: create.mutateAsync,
    isCreating: create.isPending,
    withdraw: withdraw.mutateAsync,
    isWithdrawing: withdraw.isPending,
    pause: pause.mutateAsync,
    resume: resume.mutateAsync,
    cancel: cancel.mutateAsync,
    pendingId: withdraw.variables ?? pause.variables ?? resume.variables ?? cancel.variables,
  };
}

function useStreamAction(
  publicKey: string | null,
  fn: (pk: string, id: bigint) => Promise<string>,
  ok: string,
  invalidate: () => void
) {
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!publicKey) throw new Error('Wallet not connected');
      return fn(publicKey, id);
    },
    onSuccess: () => {
      toast.success(ok);
      invalidate();
    },
    onError: (e) => toast.error(`Failed: ${msg(e)}`),
  });
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error');

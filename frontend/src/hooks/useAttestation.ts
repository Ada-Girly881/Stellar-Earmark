'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { attest, isAttestor } from '@/lib/contracts';
import type { AttestStatus } from '@/types';

export function useAttestation(publicKey: string | null) {
  const qc = useQueryClient();

  const { data: attestor = false } = useQuery({
    queryKey: ['is-attestor', publicKey],
    queryFn: () => (publicKey ? isAttestor(publicKey) : false),
    enabled: !!publicKey,
  });

  const post = useMutation({
    mutationFn: async (v: { earmarkId: bigint; status: AttestStatus; note: string }) => {
      if (!publicKey) throw new Error('Wallet not connected');
      return attest(publicKey, v.earmarkId, v.status, v.note);
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === 'Confirmed' ? 'Condition confirmed ✓' : 'Condition rejected');
      qc.invalidateQueries({ queryKey: ['earmarks-sent'] });
      qc.invalidateQueries({ queryKey: ['earmarks-received'] });
    },
    onError: (e) => toast.error(`Attestation failed: ${e instanceof Error ? e.message : 'Unknown error'}`),
  });

  return {
    isAttestor: attestor,
    attest: post.mutateAsync,
    isAttesting: post.isPending,
  };
}

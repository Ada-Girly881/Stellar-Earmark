'use client';
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getUser, isRegistered, registerUser, getUsdcBalance } from '@/lib/contracts';
import { addUsdcTrustline } from '@/lib/stellar';
import { POLL_INTERVAL_MS, USDC_FAUCET } from '@/lib/constants';
import type { Role } from '@/types';

export function useProfile(publicKey: string | null) {
  const qc = useQueryClient();

  const { data: registered = false, isLoading: checkingReg } = useQuery({
    queryKey: ['registered', publicKey],
    queryFn: () => (publicKey ? isRegistered(publicKey) : false),
    enabled: !!publicKey,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: profile = null } = useQuery({
    queryKey: ['profile', publicKey],
    queryFn: () => getUser(publicKey!),
    enabled: !!publicKey && registered,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { data: usdcBalance = 0n } = useQuery({
    queryKey: ['usdc', publicKey],
    queryFn: () => getUsdcBalance(publicKey!),
    enabled: !!publicKey,
    refetchInterval: POLL_INTERVAL_MS,
  });

  const { mutateAsync: register, isPending: isRegistering } = useMutation({
    mutationFn: async ({ name, role }: { name: string; role: Role }) => {
      if (!publicKey) throw new Error('Wallet not connected');
      return registerUser(publicKey, name, role);
    },
    onSuccess: () => {
      toast.success('Profile created');
      qc.invalidateQueries({ queryKey: ['registered', publicKey] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ['profile', publicKey] }), 2500);
    },
    onError: (e) => toast.error(`Registration failed: ${msg(e)}`),
  });

  const { mutateAsync: addTrustline, isPending: addingTrustline } = useMutation({
    mutationFn: async () => {
      if (!publicKey) throw new Error('Wallet not connected');
      return addUsdcTrustline(publicKey);
    },
    onSuccess: () => {
      toast.success('USDC trustline added', {
        description: 'Now fund it with test USDC from the Circle faucet.',
        action: { label: 'Faucet', onClick: () => window.open(USDC_FAUCET, '_blank') },
      });
      qc.invalidateQueries({ queryKey: ['usdc', publicKey] });
    },
    onError: (e) => toast.error(`Trustline failed: ${msg(e)}`),
  });

  const refetch = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['profile', publicKey] });
    qc.invalidateQueries({ queryKey: ['usdc', publicKey] });
  }, [qc, publicKey]);

  return {
    registered,
    profile,
    usdcBalance,
    isLoading: checkingReg,
    isRegistering,
    addingTrustline,
    register: (name: string, role: Role) => register({ name, role }),
    addTrustline: () => addTrustline(),
    refetch,
  };
}

const msg = (e: unknown) => (e instanceof Error ? e.message : 'Unknown error');

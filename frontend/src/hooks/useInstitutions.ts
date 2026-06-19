'use client';
import { useQuery } from '@tanstack/react-query';
import { listInstitutions } from '@/lib/contracts';
import { POLL_INTERVAL_MS } from '@/lib/constants';

export function useInstitutions() {
  const { data: institutions = [], isLoading } = useQuery({
    queryKey: ['institutions'],
    queryFn: () => listInstitutions(),
    refetchInterval: POLL_INTERVAL_MS,
  });

  const verified = institutions.filter((i) => i.verified);

  return { institutions, verified, isLoading };
}

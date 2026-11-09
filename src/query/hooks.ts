import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

import type { PveParams, PveRequestOptions } from '../proxmox/client';
import type { ClusterResource, ClusterResourceType, ClusterStatusEntry, PveVersion } from '../proxmox/types';
import { sessionRequest } from '../session/request';
import { signIn, useSession } from '../session/sessions';
import { pveKeys } from './keys';

type QueryExtras<T> = Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>;

/** GET any PVE path as a login. Disabled while the login has no session. */
export function usePveQuery<T>(loginId: string, path: string, params?: PveParams, options?: QueryExtras<T>) {
  const signedIn = useSession(loginId) != null;
  return useQuery<T>({
    ...options,
    queryKey: pveKeys.path(loginId, path, params),
    queryFn: ({ signal }) => sessionRequest<T>(loginId, path, { params, signal }),
    enabled: signedIn && (options?.enabled ?? true),
  });
}

interface PveMutationInput {
  path: string;
  method?: Exclude<PveRequestOptions['method'], 'GET'>;
  params?: PveParams;
}

/** POST/PUT/DELETE as a login; refreshes that login's queries afterwards. */
export function usePveMutation<T = unknown>(loginId: string) {
  const queryClient = useQueryClient();
  return useMutation<T, Error, PveMutationInput>({
    mutationFn: ({ path, method = 'POST', params }) => sessionRequest<T>(loginId, path, { method, params }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: pveKeys.login(loginId) }),
  });
}

export function useSignIn() {
  return useMutation({
    mutationFn: ({ loginId, secret }: { loginId: string; secret: string }) => signIn(loginId, secret),
  });
}

export const usePveVersion = (loginId: string) => usePveQuery<PveVersion>(loginId, '/version');

export const useClusterStatus = (loginId: string) =>
  usePveQuery<ClusterStatusEntry[]>(loginId, '/cluster/status', undefined, { refetchInterval: 15_000 });

export const useClusterResources = (loginId: string, type?: ClusterResourceType) =>
  usePveQuery<ClusterResource[]>(loginId, '/cluster/resources', type ? { type } : undefined, {
    refetchInterval: 10_000,
  });

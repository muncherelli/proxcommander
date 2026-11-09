import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Cluster, Endpoint, Login } from '../models';
import { normalizeEndpointUrl } from '../proxmox/client';
import { appData, isWeb } from '../storage/backends';
import { deleteLoginSecret } from '../storage/secrets';

interface ProfilesState {
  clusters: Cluster[];
  logins: Login[];
}

// Resolves once stored profiles have loaded, or failed to (corrupt or unreadable storage).
let finishHydration: () => void = () => {};
const hydrated = new Promise<void>((resolve) => {
  finishHydration = resolve;
});

/** Whether a login survives a restart: its cluster and its username are both remembered. */
export function isLoginPersisted(login: Login, cluster: Cluster): boolean {
  return cluster.rememberHostnames && login.rememberUsername;
}

/**
 * Saved clusters and logins. Only clusters with `rememberHostnames`, and
 * logins with `rememberUsername` on a remembered cluster, are written to
 * storage; everything else lives for this run only.
 */
export const useProfiles = create<ProfilesState>()(
  persist((): ProfilesState => ({ clusters: [], logins: [] }), {
    name: 'pc.profiles',
    version: 1,
    storage: createJSONStorage(() => appData),
    onRehydrateStorage: () => () => finishHydration(),
    partialize: ({ clusters, logins }) => {
      const remembered = clusters.filter((cluster) => cluster.rememberHostnames);
      return {
        clusters: remembered,
        logins: logins.filter((login) => {
          const cluster = remembered.find((candidate) => candidate.id === login.clusterId);
          return cluster != null && isLoginPersisted(login, cluster);
        }),
      };
    },
  }),
);

/** Remember-me defaults: opt-in on web, on by default on your own device. */
export const REMEMBER_BY_DEFAULT = !isWeb;

export function profilesHydrated(): Promise<void> {
  return hydrated;
}

export function findCluster(clusterId: string): Cluster | undefined {
  return useProfiles.getState().clusters.find((cluster) => cluster.id === clusterId);
}

export function findLogin(loginId: string): Login | undefined {
  return useProfiles.getState().logins.find((login) => login.id === loginId);
}

function withEndpointIds(endpoints: Array<Omit<Endpoint, 'id'> & { id?: string }>): Endpoint[] {
  return endpoints.map((endpoint) => ({
    ...endpoint,
    id: endpoint.id ?? randomUUID(),
    url: normalizeEndpointUrl(endpoint.url),
  }));
}

export interface ClusterInput extends Omit<Cluster, 'id' | 'createdAt' | 'endpoints'> {
  endpoints: Array<Omit<Endpoint, 'id'> & { id?: string }>;
}

export function addCluster(input: ClusterInput): Cluster {
  const cluster: Cluster = {
    ...input,
    id: randomUUID(),
    endpoints: withEndpointIds(input.endpoints),
    createdAt: Date.now(),
  };
  useProfiles.setState((state) => ({ clusters: [...state.clusters, cluster] }));
  return cluster;
}

export function updateCluster(clusterId: string, patch: Partial<ClusterInput>): void {
  useProfiles.setState((state) => ({
    clusters: state.clusters.map((cluster) =>
      cluster.id !== clusterId
        ? cluster
        : {
            ...cluster,
            ...patch,
            endpoints: patch.endpoints ? withEndpointIds(patch.endpoints) : cluster.endpoints,
          },
    ),
  }));
  dropOrphanedSecrets((login) => login.clusterId === clusterId);
}

/** A remembered secret is kept only while its login is remembered too. */
function dropOrphanedSecrets(which: (login: Login) => boolean): void {
  const { clusters, logins } = useProfiles.getState();
  for (const login of logins.filter(which)) {
    const cluster = clusters.find((candidate) => candidate.id === login.clusterId);
    if (!login.rememberSecret || !cluster || !isLoginPersisted(login, cluster)) void deleteLoginSecret(login.id);
  }
}

/** Removes the cluster and every login on it. Sessions end via the session store. */
export function removeCluster(clusterId: string): void {
  const doomed = useProfiles.getState().logins.filter((login) => login.clusterId === clusterId);
  useProfiles.setState((state) => ({
    clusters: state.clusters.filter((cluster) => cluster.id !== clusterId),
    logins: state.logins.filter((login) => login.clusterId !== clusterId),
  }));
  doomed.forEach((login) => void deleteLoginSecret(login.id));
}

export type LoginInput = Omit<Login, 'id' | 'createdAt'>;

export function addLogin(input: LoginInput): Login {
  const login: Login = { ...input, id: randomUUID(), createdAt: Date.now() };
  useProfiles.setState((state) => ({ logins: [...state.logins, login] }));
  return login;
}

export function updateLogin(loginId: string, patch: Partial<LoginInput>): void {
  useProfiles.setState((state) => ({
    logins: state.logins.map((login) => (login.id === loginId ? { ...login, ...patch } : login)),
  }));
  dropOrphanedSecrets((login) => login.id === loginId);
}

export function removeLogin(loginId: string): void {
  useProfiles.setState((state) => ({ logins: state.logins.filter((login) => login.id !== loginId) }));
  void deleteLoginSecret(loginId);
}

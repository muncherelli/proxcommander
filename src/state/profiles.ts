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
    partialize: ({ clusters, logins }) => {
      const remembered = clusters.filter((cluster) => cluster.rememberHostnames);
      const clusterIds = new Set(remembered.map((cluster) => cluster.id));
      return {
        clusters: remembered,
        logins: logins.filter((login) => login.rememberUsername && clusterIds.has(login.clusterId)),
      };
    },
  }),
);

/** Remember-me defaults: opt-in on web, on by default on your own device. */
export const REMEMBER_BY_DEFAULT = !isWeb;

export function profilesHydrated(): Promise<void> {
  if (useProfiles.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useProfiles.persist.onFinishHydration(() => {
      unsubscribe();
      resolve();
    });
  });
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
  if (patch.rememberSecret === false) void deleteLoginSecret(loginId);
}

export function removeLogin(loginId: string): void {
  useProfiles.setState((state) => ({ logins: state.logins.filter((login) => login.id !== loginId) }));
  void deleteLoginSecret(loginId);
}

import type { SessionPolicy } from './session/policy';

/** Product behind a cluster. Proxmox Datacenter Manager ('pdm') may follow. */
export type ProductKind = 'pve';

/** One address a cluster answers on, e.g. https://pve1.lan:8006. */
export interface Endpoint {
  id: string;
  url: string;
  label?: string;
}

export interface Cluster {
  id: string;
  name: string;
  kind: ProductKind;
  /** Tried in order; the session remembers whichever answered last. */
  endpoints: Endpoint[];
  /** Keep this cluster and its addresses across restarts. */
  rememberHostnames: boolean;
  createdAt: number;
}

export type AuthMethod = 'password' | 'token';

/** A saved identity on a cluster. A cluster can have several. */
export interface Login {
  id: string;
  clusterId: string;
  label?: string;
  /** User name without the realm, e.g. "root". */
  username: string;
  /** Authentication realm, e.g. "pam" or "pve". */
  realm: string;
  authMethod: AuthMethod;
  /** API token name (the part after "!") when authMethod is 'token'. */
  tokenName?: string;
  /** Keep this login across restarts (only if its cluster is remembered too). */
  rememberUsername: boolean;
  /** Keep the password / token secret in the keychain. Ignored on web. */
  rememberSecret: boolean;
  sessionPolicy: SessionPolicy;
  createdAt: number;
}

/** PVE user id, e.g. "root@pam". */
export function userId(login: Pick<Login, 'username' | 'realm'>): string {
  return `${login.username}@${login.realm}`;
}

/** PVE API token id, e.g. "root@pam!automation". */
export function tokenId(login: Pick<Login, 'username' | 'realm' | 'tokenName'>): string {
  return `${userId(login)}!${login.tokenName ?? ''}`;
}

import type { PveParams } from '../proxmox/client';

/** Every PVE query is scoped to a login, so signing out clears just that login's cache. */
export const pveKeys = {
  all: ['pve'] as const,
  login: (loginId: string) => ['pve', loginId] as const,
  path: (loginId: string, path: string, params?: PveParams) => ['pve', loginId, path, params ?? {}] as const,
};

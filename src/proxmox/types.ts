/** GET /version */
export interface PveVersion {
  version: string;
  release: string;
  repoid: string;
}

export type ClusterResourceType = 'node' | 'qemu' | 'lxc' | 'storage' | 'pool' | 'sdn' | 'openvz';

/** One row of GET /cluster/resources. Fields depend on `type`. */
export interface ClusterResource {
  id: string;
  type: ClusterResourceType;
  node?: string;
  status?: string;
  name?: string;
  vmid?: number;
  template?: 0 | 1;
  pool?: string;
  storage?: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  tags?: string;
}

/** One row of GET /cluster/status. */
export interface ClusterStatusEntry {
  id: string;
  type: 'cluster' | 'node';
  name: string;
  online?: 0 | 1;
  local?: 0 | 1;
  ip?: string;
  quorate?: 0 | 1;
  nodes?: number;
}

import { PveError, pveRequest, withEndpointFailover, type PveRequestOptions } from '../proxmox/client';
import { findCluster } from '../state/profiles';
import { patchSession, signOut, useSessions } from './sessions';

/** Calls the PVE API as a signed-in login, failing over between the cluster's endpoints. */
export async function sessionRequest<T>(
  loginId: string,
  path: string,
  options: Omit<PveRequestOptions, 'auth'> = {},
): Promise<T> {
  const session = useSessions.getState().sessions[loginId];
  const cluster = session && findCluster(session.clusterId);
  if (!session || !cluster) throw new PveError(401, 'Not signed in');

  try {
    const { result, endpointId } = await withEndpointFailover(cluster.endpoints, session.endpointId, (url) =>
      pveRequest<T>(url, path, { ...options, auth: session.auth }),
    );
    if (endpointId !== session.endpointId) patchSession(loginId, { endpointId });
    return result;
  } catch (error) {
    if (error instanceof PveError && error.status === 401) signOut(loginId, 'rejected');
    throw error;
  }
}

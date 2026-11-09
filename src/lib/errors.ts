import { PveError, PveNetworkError, PveTfaRequiredError } from '../proxmox/client';
import { isWeb } from '../storage/backends';

const WEB_PROXY_HINT = isWeb && !process.env.EXPO_PUBLIC_PVE_DEV_PROXY
  ? ' Browsers need a CORS proxy in front of Proxmox — see "Web against a real Proxmox host" in the README.'
  : '';

/** A user-facing sentence for anything the PVE layer throws. */
export function errorMessage(error: unknown): string {
  if (error instanceof PveTfaRequiredError) return error.message;
  if (error instanceof PveNetworkError) {
    return `Couldn't reach any address for this cluster (${error.message}).${WEB_PROXY_HINT}`;
  }
  if (error instanceof PveError) {
    return error.status === 401 ? 'Authentication failed — check the username, realm and password.' : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

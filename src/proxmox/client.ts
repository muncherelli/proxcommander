import { isWeb } from '../storage/backends';
import type { Endpoint } from '../models';

export type PveAuth =
  | { type: 'ticket'; ticket: string; csrfToken: string }
  | { type: 'token'; tokenId: string; secret: string };

export type PveParams = Record<string, string | number | boolean | null | undefined>;

export interface PveRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  params?: PveParams;
  auth?: PveAuth;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** The server answered with an error status. */
export class PveError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Per-parameter validation messages, when PVE sends them. */
    readonly errors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'PveError';
  }
}

/** The endpoint could not be reached (DNS, TLS, refused, timeout). Safe to try another. */
export class PveNetworkError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'PveNetworkError';
  }
}

/** The login needs a second factor. TODO: implement the TFA challenge flow. */
export class PveTfaRequiredError extends Error {
  constructor(readonly challengeTicket: string) {
    super('Two-factor authentication is not supported yet');
    this.name = 'PveTfaRequiredError';
  }
}

const DEFAULT_PORT = 8006;
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * PVE sends no CORS headers, so browsers cannot call it directly. During web
 * development requests go through scripts/pve-dev-proxy.mjs instead.
 */
const webProxy = isWeb ? process.env.EXPO_PUBLIC_PVE_DEV_PROXY : undefined;

/** Accepts "host", "host:port" or a URL; returns "https://host:port". */
export function normalizeEndpointUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== 'https:') throw new Error('Proxmox endpoints must use https');
  // URL drops a default port, so an explicit ":443" has to be read from the input.
  const explicitPort = /^[a-z]+:\/\/(?:\[[^\]]*\]|[^/?#:]*)(?::(\d+))?/i.exec(withScheme)?.[1];
  return `https://${url.hostname}:${url.port || explicitPort || DEFAULT_PORT}`;
}

function apiBase(endpointUrl: string): string {
  const origin = normalizeEndpointUrl(endpointUrl);
  return webProxy
    ? `${webProxy.replace(/\/$/, '')}/${encodeURIComponent(origin)}/api2/json`
    : `${origin}/api2/json`;
}

function encodeParams(params: PveParams | undefined): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value == null) continue;
    search.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  return search.toString();
}

function authHeaders(auth: PveAuth | undefined, method: string): Record<string, string> {
  if (!auth) return {};
  if (auth.type === 'token') return { Authorization: `PVEAPIToken=${auth.tokenId}=${auth.secret}` };
  // pve-http-server reads the ticket from the Authorization header when no cookie is sent.
  const headers: Record<string, string> = { Authorization: `PVEAuthCookie=${auth.ticket}` };
  if (method !== 'GET') headers.CSRFPreventionToken = auth.csrfToken;
  return headers;
}

/** Calls one endpoint and unwraps PVE's `{ data }` envelope. */
export async function pveRequest<T>(endpointUrl: string, path: string, options: PveRequestOptions = {}): Promise<T> {
  const { method = 'GET', params, auth, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const query = encodeParams(params);
  const hasBody = method === 'POST' || method === 'PUT';
  const url = `${apiBase(endpointUrl)}${path}${!hasBody && query ? `?${query}` : ''}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...authHeaders(auth, method),
      },
      body: hasBody ? query : undefined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new PveNetworkError(controller.signal.aborted ? 'Request timed out' : 'Endpoint unreachable', error);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }

  const body = (await response.json().catch(() => null)) as
    | { data?: T; message?: string; errors?: Record<string, string> }
    | null;
  if (!response.ok) {
    // PVE puts the human-readable reason in the status line.
    const message = body?.message?.trim() || response.statusText || `HTTP ${response.status}`;
    throw new PveError(response.status, message, body?.errors ?? undefined);
  }
  return body?.data as T;
}

/**
 * Runs `run` against each endpoint in turn, starting with the preferred one,
 * moving on only when an endpoint is unreachable.
 */
export async function withEndpointFailover<T>(
  endpoints: Endpoint[],
  preferredId: string | undefined,
  run: (endpointUrl: string) => Promise<T>,
): Promise<{ result: T; endpointId: string }> {
  const ordered = [...endpoints].sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId));
  let lastError: unknown = new PveNetworkError('No endpoints configured');
  for (const endpoint of ordered) {
    try {
      return { result: await run(endpoint.url), endpointId: endpoint.id };
    } catch (error) {
      if (!(error instanceof PveNetworkError)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

export interface PveTicket {
  ticket: string;
  csrfToken: string;
  /** User id as the server spells it, e.g. "root@pam". */
  username: string;
  clusterName?: string;
}

/** POST /access/ticket. Pass the current ticket as `password` to renew it. */
export async function createTicket(
  endpointUrl: string,
  username: string,
  password: string,
  signal?: AbortSignal,
): Promise<PveTicket> {
  const data = await pveRequest<{
    ticket: string;
    CSRFPreventionToken: string;
    username: string;
    clustername?: string;
    NeedTFA?: number;
  }>(endpointUrl, '/access/ticket', { method: 'POST', params: { username, password }, signal });
  if (data.NeedTFA) throw new PveTfaRequiredError(data.ticket);
  return {
    ticket: data.ticket,
    csrfToken: data.CSRFPreventionToken,
    username: data.username,
    clusterName: data.clustername,
  };
}

import { create } from 'zustand';

import { tokenId, userId, type Cluster, type Login } from '../models';
import {
  createTicket,
  PveError,
  pveRequest,
  withEndpointFailover,
  type PveAuth,
} from '../proxmox/client';
import type { PveVersion } from '../proxmox/types';
import { queryClient } from '../query/client';
import { pveKeys } from '../query/keys';
import { findCluster, findLogin, profilesHydrated, useProfiles } from '../state/profiles';
import { isWeb, type Persistence } from '../storage/backends';
import { loadLoginSecret, saveLoginSecret } from '../storage/secrets';
import { expiryReason, shouldRenewTicket, type SessionEndReason, type SessionPolicy } from './policy';
import { eraseSession, readSessions, writeSession } from './vault';

/** A signed-in login. At most one per login; any number of logins at once. */
export interface Session {
  loginId: string;
  clusterId: string;
  /** Endpoint that answered last; tried first next time. */
  endpointId: string;
  auth: PveAuth;
  /** User id as the server reported it. */
  userId: string;
  /** Effective persistence: the policy's, capped by what may be stored. */
  persistence: Persistence;
  policy: SessionPolicy;
  startedAt: number;
  ticketIssuedAt?: number;
  lastActiveAt: number;
}

interface SessionsState {
  sessions: Record<string, Session>;
  hydrated: boolean;
  lastEnded?: { loginId: string; reason: SessionEndReason };
}

export const useSessions = create<SessionsState>(() => ({ sessions: {}, hydrated: false }));

export function useSession(loginId: string): Session | undefined {
  return useSessions((state) => state.sessions[loginId]);
}

/**
 * Web never stores API token secrets, and a session whose cluster or username
 * isn't remembered can't be restored after a reload, so neither is kept.
 */
function effectivePersistence(login: Login, cluster: Cluster, auth: PveAuth): Persistence {
  if (isWeb && auth.type === 'token') return 'memory';
  if (!cluster.rememberHostnames || !login.rememberUsername) return 'memory';
  return login.sessionPolicy.persistence;
}

function put(session: Session): void {
  useSessions.setState((state) => ({ sessions: { ...state.sessions, [session.loginId]: session } }));
  void writeSession(session);
}

export function patchSession(loginId: string, changes: Partial<Session>): void {
  const session = useSessions.getState().sessions[loginId];
  if (session) put({ ...session, ...changes });
}

function profileFor(loginId: string): { login: Login; cluster: Cluster } {
  const login = findLogin(loginId);
  const cluster = login && findCluster(login.clusterId);
  if (!login || !cluster) throw new Error(`Unknown login ${loginId}`);
  return { login, cluster };
}

/**
 * Signs a login in with its password, or its token secret for token logins.
 * `continueFrom` keeps the original start time, so max-age still counts from
 * the first sign-in when a stored password silently renews an expired ticket.
 */
export async function signIn(loginId: string, secret: string, continueFrom?: Session): Promise<Session> {
  const { login, cluster } = profileFor(loginId);
  const preferred = continueFrom?.endpointId ?? useSessions.getState().sessions[loginId]?.endpointId;
  const now = Date.now();

  let auth: PveAuth;
  let serverUserId: string;
  let endpointId: string;
  if (login.authMethod === 'password') {
    const signedIn = await withEndpointFailover(cluster.endpoints, preferred, (url) =>
      createTicket(url, userId(login), secret),
    );
    auth = { type: 'ticket', ticket: signedIn.result.ticket, csrfToken: signedIn.result.csrfToken };
    serverUserId = signedIn.result.username;
    endpointId = signedIn.endpointId;
  } else {
    auth = { type: 'token', tokenId: tokenId(login), secret };
    // Tokens have no login call; any authenticated request proves the secret.
    const checked = await withEndpointFailover(cluster.endpoints, preferred, (url) =>
      pveRequest<PveVersion>(url, '/version', { auth }),
    );
    serverUserId = userId(login);
    endpointId = checked.endpointId;
  }

  if (login.rememberSecret) await saveLoginSecret(loginId, secret);

  const session: Session = {
    loginId,
    clusterId: cluster.id,
    endpointId,
    auth,
    userId: serverUserId,
    persistence: effectivePersistence(login, cluster, auth),
    policy: login.sessionPolicy,
    startedAt: continueFrom?.startedAt ?? now,
    ticketIssuedAt: auth.type === 'ticket' ? now : undefined,
    lastActiveAt: now,
  };
  put(session);
  return session;
}

export function signOut(loginId: string, reason: SessionEndReason = 'signed-out'): void {
  if (!useSessions.getState().sessions[loginId]) return;
  useSessions.setState((state) => {
    const { [loginId]: _ended, ...sessions } = state.sessions;
    return { sessions, lastEnded: { loginId, reason } };
  });
  void eraseSession(loginId);
  queryClient.removeQueries({ queryKey: pveKeys.login(loginId) });
}

/** Signs in again with a keychain-stored secret (native only). */
async function reauthenticate(session: Session): Promise<boolean> {
  const login = findLogin(session.loginId);
  if (!login?.rememberSecret) return false;
  const secret = await loadLoginSecret(session.loginId);
  if (!secret) return false;
  try {
    await signIn(session.loginId, secret, session);
    return true;
  } catch {
    return false;
  }
}

async function renewTicket(session: Session): Promise<void> {
  if (session.auth.type !== 'ticket') return;
  const cluster = findCluster(session.clusterId);
  if (!cluster) return;
  try {
    const renewed = await withEndpointFailover(cluster.endpoints, session.endpointId, (url) =>
      createTicket(url, session.userId, (session.auth as { ticket: string }).ticket),
    );
    patchSession(session.loginId, {
      auth: { type: 'ticket', ticket: renewed.result.ticket, csrfToken: renewed.result.csrfToken },
      ticketIssuedAt: Date.now(),
      endpointId: renewed.endpointId,
    });
  } catch (error) {
    // Unreachable: keep the ticket and retry on the next pass.
    if (error instanceof PveError && !(await reauthenticate(session))) signOut(session.loginId, 'rejected');
  }
}

let maintaining = false;

/** Ends expired sessions and renews tickets that are due. Runs on a timer and on resume. */
export async function maintainSessions(now = Date.now()): Promise<void> {
  if (maintaining) return;
  maintaining = true;
  try {
    for (const session of Object.values(useSessions.getState().sessions)) {
      const reason = expiryReason(session, now);
      if (reason === 'ticket-expired' && (await reauthenticate(session))) continue;
      if (reason) signOut(session.loginId, reason);
      else if (shouldRenewTicket(session, now)) await renewTicket(session);
    }
  } finally {
    maintaining = false;
  }
}

/** Idle timeouts are minutes long, so activity is recorded at this granularity. */
const ACTIVITY_GRANULARITY_MS = 30_000;
let lastActivity = 0;

/** Call on user input. Background polling must not keep a session alive. */
export function markActive(now = Date.now()): void {
  if (now - lastActivity < ACTIVITY_GRANULARITY_MS) return;
  lastActivity = now;
  for (const session of Object.values(useSessions.getState().sessions)) {
    if (!expiryReason(session, now)) patchSession(session.loginId, { lastActiveAt: now });
  }
}

let hydration: Promise<void> | undefined;

/** Restores stored sessions once profiles have loaded, dropping orphans and expired ones. */
export function hydrateSessions(): Promise<void> {
  hydration ??= (async () => {
    await profilesHydrated();
    const sessions: Record<string, Session> = {};
    for (const stored of await readSessions()) {
      const login = findLogin(stored.loginId);
      if (login && findCluster(login.clusterId)) sessions[stored.loginId] = stored;
      else void eraseSession(stored.loginId);
    }
    useSessions.setState((state) => ({ sessions: { ...sessions, ...state.sessions }, hydrated: true }));
    await maintainSessions();
  })();
  return hydration;
}

// Keep sessions in step with profile edits: removed logins sign out, and
// policy or remember-me changes move the stored session where it now belongs.
useProfiles.subscribe(({ logins, clusters }) => {
  for (const session of Object.values(useSessions.getState().sessions)) {
    const login = logins.find((candidate) => candidate.id === session.loginId);
    const cluster = clusters.find((candidate) => candidate.id === session.clusterId);
    if (!login || !cluster) {
      signOut(session.loginId);
      continue;
    }
    const persistence = effectivePersistence(login, cluster, session.auth);
    const policyChanged = JSON.stringify(login.sessionPolicy) !== JSON.stringify(session.policy);
    if (persistence !== session.persistence || policyChanged) {
      patchSession(session.loginId, { persistence, policy: login.sessionPolicy });
    }
  }
});

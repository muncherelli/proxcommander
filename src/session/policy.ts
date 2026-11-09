import { isWeb, type Persistence } from '../storage/backends';

/** Client-side rules layered on top of what the PVE server allows. */
export interface SessionPolicy {
  /** Where the session's ticket is kept between launches. */
  persistence: Persistence;
  /** End the session after this long without user input. null = never. */
  idleTimeoutMinutes: number | null;
  /** End the session this long after sign-in, renewals included. null = never. */
  maxAgeHours: number | null;
  /** Renew the PVE ticket before it expires. Off = session ends with the ticket. */
  autoRenew: boolean;
}

/** PVE tickets are valid for two hours (pve-access-control `$ticket_lifetime`). */
export const PVE_TICKET_LIFETIME_MS = 2 * 60 * 60 * 1000;
/** Renew well inside the lifetime, as the PVE web UI does. */
export const PVE_TICKET_RENEW_AFTER_MS = 15 * 60 * 1000;

export const SESSION_PRESETS = {
  strict: { persistence: 'tab', idleTimeoutMinutes: 15, maxAgeHours: 2, autoRenew: true },
  standard: { persistence: 'device', idleTimeoutMinutes: 60, maxAgeHours: 12, autoRenew: true },
  extended: { persistence: 'device', idleTimeoutMinutes: null, maxAgeHours: 24 * 7, autoRenew: true },
} satisfies Record<string, SessionPolicy>;

export type SessionPresetName = keyof typeof SESSION_PRESETS;

export const DEFAULT_SESSION_POLICY: SessionPolicy = isWeb
  ? SESSION_PRESETS.standard
  : SESSION_PRESETS.extended;

export type SessionEndReason = 'idle' | 'max-age' | 'ticket-expired' | 'rejected' | 'signed-out';

interface SessionClock {
  policy: SessionPolicy;
  startedAt: number;
  lastActiveAt: number;
  /** Set for ticket sessions; API token sessions have no ticket to expire. */
  ticketIssuedAt?: number;
}

export function expiryReason(session: SessionClock, now = Date.now()): SessionEndReason | null {
  const { policy } = session;
  if (policy.maxAgeHours != null && now - session.startedAt >= policy.maxAgeHours * 3_600_000) {
    return 'max-age';
  }
  if (policy.idleTimeoutMinutes != null && now - session.lastActiveAt >= policy.idleTimeoutMinutes * 60_000) {
    return 'idle';
  }
  if (session.ticketIssuedAt != null && now - session.ticketIssuedAt >= PVE_TICKET_LIFETIME_MS) {
    return 'ticket-expired';
  }
  return null;
}

export function shouldRenewTicket(session: SessionClock, now = Date.now()): boolean {
  return (
    session.policy.autoRenew &&
    session.ticketIssuedAt != null &&
    now - session.ticketIssuedAt >= PVE_TICKET_RENEW_AFTER_MS
  );
}

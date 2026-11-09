import type { SessionEndReason, SessionPolicy } from '../session/policy';
import { isWeb } from '../storage/backends';

const BYTE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];

export function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${BYTE_UNITS[unit]}`;
}

export function formatPercent(fraction: number | undefined): string {
  return fraction == null ? '—' : `${(fraction * 100).toFixed(0)}%`;
}

const PERSISTENCE_LABEL = {
  memory: 'Not kept',
  tab: isWeb ? 'This tab' : 'Until the app closes',
  device: isWeb ? 'This browser' : 'Keychain',
} as const;

export function describePolicy(policy: SessionPolicy): string {
  return [
    PERSISTENCE_LABEL[policy.persistence],
    policy.idleTimeoutMinutes == null ? 'no idle limit' : `${policy.idleTimeoutMinutes} min idle`,
    policy.maxAgeHours == null ? 'no max age' : `${policy.maxAgeHours} h max`,
  ].join(' · ');
}

export const SESSION_END_LABEL: Record<SessionEndReason, string> = {
  idle: 'idle timeout reached',
  'max-age': 'maximum session length reached',
  'ticket-expired': 'ticket expired',
  rejected: 'the server rejected the session',
  'signed-out': 'signed out',
};

import { credentialBackends, type KeyValueBackend, type Persistence } from '../storage/backends';
import type { Session } from './sessions';

// Stores each session under its own key in the backend its persistence names,
// with a per-backend index of login ids (SecureStore cannot list its keys).

const INDEX_KEY = 'pc.sessions';
export const SESSION_KEY_PREFIX = 'pc.session.';
const sessionKey = (loginId: string) => `${SESSION_KEY_PREFIX}${loginId}`;
const STORED_LEVELS: Persistence[] = ['tab', 'device'];

let queue: Promise<unknown> = Promise.resolve();

/** Index updates are read-modify-write, so run vault operations one at a time. */
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => {});
  return run;
}

async function readIndex(backend: KeyValueBackend): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse((await backend.getItem(INDEX_KEY)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

async function setIndexed(backend: KeyValueBackend, loginId: string, value: string | null): Promise<void> {
  const index = new Set(await readIndex(backend));
  if (value == null) {
    // Remove the value even when the index has lost track of it.
    await backend.removeItem(sessionKey(loginId));
    if (!index.delete(loginId)) return;
  } else {
    index.add(loginId);
    await backend.setItem(sessionKey(loginId), value);
  }
  await backend.setItem(INDEX_KEY, JSON.stringify([...index]));
}

/** Writes the session to its own level and clears it from every other level. */
export function writeSession(session: Session): Promise<void> {
  return serial(async () => {
    for (const level of STORED_LEVELS) {
      const value = level === session.persistence ? JSON.stringify(session) : null;
      await setIndexed(credentialBackends[level], session.loginId, value);
    }
  });
}

export function eraseSession(loginId: string): Promise<void> {
  return serial(async () => {
    for (const level of STORED_LEVELS) await setIndexed(credentialBackends[level], loginId, null);
  });
}

export function readSessions(): Promise<Session[]> {
  return serial(async () => {
    const sessions: Session[] = [];
    for (const level of STORED_LEVELS) {
      const backend = credentialBackends[level];
      for (const loginId of await readIndex(backend)) {
        try {
          const stored = await backend.getItem(sessionKey(loginId));
          if (stored) sessions.push(JSON.parse(stored) as Session);
        } catch {}
      }
    }
    return sessions;
  });
}

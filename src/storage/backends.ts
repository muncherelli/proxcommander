import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export interface KeyValueBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * How long a stored value survives, least to most durable.
 * - memory: until the JS context goes away (reload, app kill)
 * - tab:    web sessionStorage (this tab only); same as memory on native
 * - device: web localStorage; native keychain / keystore
 */
export type Persistence = 'memory' | 'tab' | 'device';

const DURABILITY: Record<Persistence, number> = { memory: 0, tab: 1, device: 2 };

export function leastDurable(a: Persistence, b: Persistence): Persistence {
  return DURABILITY[a] <= DURABILITY[b] ? a : b;
}

export const isWeb = Platform.OS === 'web';

/**
 * Passwords and API token secrets are only ever written on native, where the
 * OS keychain / keystore protects them. On web they live in memory only.
 */
export const canStoreLongLivedSecrets = !isWeb;

function memoryBackend(): KeyValueBackend {
  const values = new Map<string, string>();
  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

// Web Storage can throw (private mode, blocked site data); treat that as empty.
function webStorageBackend(storage: () => Storage): KeyValueBackend {
  return {
    async getItem(key) {
      try {
        return storage().getItem(key);
      } catch {
        return null;
      }
    },
    async setItem(key, value) {
      try {
        storage().setItem(key, value);
      } catch {}
    },
    async removeItem(key) {
      try {
        storage().removeItem(key);
      } catch {}
    },
  };
}

const secureStoreBackend: KeyValueBackend = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

const memory = memoryBackend();

/** Non-secret app data: cluster names, hostnames, usernames, preferences. */
export const appData: KeyValueBackend = AsyncStorage;

/**
 * Credential storage per persistence level. On web, `device` is localStorage,
 * so only short-lived credentials (PVE tickets) may go there.
 */
export const credentialBackends: Record<Persistence, KeyValueBackend> = isWeb
  ? {
      memory,
      tab: webStorageBackend(() => window.sessionStorage),
      device: webStorageBackend(() => window.localStorage),
    }
  : { memory, tab: memory, device: secureStoreBackend };

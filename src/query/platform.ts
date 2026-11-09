import { focusManager, onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener } from 'expo-network';
import { AppState } from 'react-native';

import { isWeb } from '../storage/backends';

/**
 * React Query listens to window focus and online events on web by default.
 * Native needs AppState and the network state wired in by hand.
 */
export function setupReactQueryPlatform(): void {
  if (isWeb) return;

  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener('change', (state) => setFocused(state === 'active'));
    return () => subscription.remove();
  });

  onlineManager.setEventListener((setOnline) => {
    const subscription = addNetworkStateListener((state) => setOnline(state.isConnected !== false));
    return () => subscription.remove();
  });
}

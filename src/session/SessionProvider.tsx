import { useEffect, type PropsWithChildren } from 'react';
import { AppState, View } from 'react-native';

import { isWeb } from '../storage/backends';
import { followOtherTabs, hydrateSessions, maintainSessions, markActive, useSessions } from './sessions';

const MAINTENANCE_INTERVAL_MS = 30_000;
const WEB_INPUT_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const;

/**
 * Restores sessions, enforces their timeout rules, and records user input as
 * activity for idle timeouts. Renders nothing until sessions are restored.
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const hydrated = useSessions((state) => state.hydrated);

  useEffect(() => {
    void hydrateSessions();
    const timer = setInterval(() => void maintainSessions(), MAINTENANCE_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void maintainSessions();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isWeb) return;
    const onInput = () => markActive();
    WEB_INPUT_EVENTS.forEach((event) => window.addEventListener(event, onInput, { capture: true, passive: true }));
    const stopFollowing = followOtherTabs();
    return () => {
      WEB_INPUT_EVENTS.forEach((event) => window.removeEventListener(event, onInput, { capture: true }));
      stopFollowing();
    };
  }, []);

  if (!hydrated) return null;
  return (
    <View style={{ flex: 1 }} onTouchStartCapture={isWeb ? undefined : () => markActive()}>
      {children}
    </View>
  );
}

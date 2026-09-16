import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';

/** Pulls the code out of a groupmate://join/CODE link. Null for any other URL. */
export function parseInviteCode(url: string | null): string | null {
  if (!url) return null;
  const match = /join\/([A-Za-z0-9]+)/.exec(url);
  return match ? match[1].toUpperCase() : null;
}

/**
 * The invite code the app was opened with, if it was opened from a shared
 * invite link. Both entry points read this — AuthScreen (a new account
 * signing up into the project) and the onboarding join flow (an existing
 * account with no project yet) — so a tapped link lands the person in the
 * right place with the code already filled in instead of making them type
 * eight characters off a screenshot.
 *
 * Covers both cold start (getInitialURL) and a link arriving while the app
 * is already open (the 'url' event).
 */
export function useIncomingInviteCode(): string | null {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Linking.getInitialURL().then((url) => {
      const initial = parseInviteCode(url);
      // Don't clobber a link that arrived while this promise was in flight.
      if (!cancelled && initial) setCode((current) => current ?? initial);
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      const next = parseInviteCode(url);
      if (next) setCode(next);
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return code;
}

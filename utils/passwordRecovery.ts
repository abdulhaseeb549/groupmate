import { useEffect, useState } from 'react';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

/**
 * Where resetPasswordForEmail's link points — must also be added to Supabase's
 * Auth → URL Configuration → Redirect URLs allowlist, or the email link opens
 * the app with an error instead of these params.
 *
 * Explicit `scheme` forces a stable `groupmate://reset-password`, the same
 * link invite codes already use in production. Without it, createURL()
 * resolves relative to whatever's currently serving the JS bundle (Metro's
 * host, e.g. `http://localhost:8081/reset-password`) whenever the app is
 * running through a dev/Metro session rather than a fully standalone build —
 * a real link tapped from an email client obviously can't reach that.
 */
export function passwordResetRedirectUrl(): string {
  return Linking.createURL('reset-password', { scheme: 'groupmate' });
}

type RecoveryParams =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'otp'; tokenHash: string };

/**
 * Supabase's recovery link shape has changed across versions and isn't
 * fully pinned down without sending a real email through this project's
 * settings, so all three documented shapes are handled: a PKCE `code`
 * (matches this app's flowType, and what signInWithGoogle already expects
 * back), the older implicit `access_token`/`refresh_token` pair (arrives
 * in the URL fragment, not the query), or an OTP `token_hash`. Whichever
 * one Supabase actually sends, this reads the same either in the query
 * string or after a `#`, since a fragment is a client-only concept and
 * survives a deep link intact.
 */
function parseRecoveryLink(url: string | null): RecoveryParams | null {
  if (!url || !url.includes('reset-password')) return null;
  const combined = url.replace(/^[^?#]*/, '').replace('#', '&').replace(/^[?&]/, '');
  const params = new URLSearchParams(combined);

  const code = params.get('code');
  if (code) return { kind: 'code', code };

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };

  const tokenHash = params.get('token_hash');
  if (tokenHash && params.get('type') === 'recovery') return { kind: 'otp', tokenHash };

  return null;
}

export type RecoveryStatus =
  | { state: 'idle' }
  | { state: 'verifying' }
  | { state: 'ready' }
  | { state: 'error'; message: string };

/**
 * Detects the app being opened via a password-reset email link, exchanges
 * whatever it carries for a real session, and reports the result so
 * App.tsx can show "set a new password" instead of the normal
 * signed-out/signed-in split — landing straight in Home with the OLD
 * password's session would be wrong, and landing on the sign-in form
 * would strand someone who just proved account ownership via email.
 * Covers both cold start (getInitialURL) and the link arriving while the
 * app is already open (the 'url' event) — same shape as useIncomingInviteCode.
 */
export function useIncomingPasswordRecovery(): RecoveryStatus & { reset: () => void } {
  const [status, setStatus] = useState<RecoveryStatus>({ state: 'idle' });

  useEffect(() => {
    let cancelled = false;

    async function handle(url: string | null) {
      const parsed = parseRecoveryLink(url);
      if (!parsed) return;
      setStatus({ state: 'verifying' });
      try {
        if (parsed.kind === 'code') {
          const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
          if (error) throw error;
        } else if (parsed.kind === 'tokens') {
          const { error } = await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.tokenHash, type: 'recovery' });
          if (error) throw error;
        }
        if (!cancelled) setStatus({ state: 'ready' });
      } catch {
        if (!cancelled) setStatus({ state: 'error', message: 'This reset link is invalid or has expired.' });
      }
    }

    void Linking.getInitialURL().then((url) => {
      if (!cancelled) void handle(url);
    });
    const subscription = Linking.addEventListener('url', ({ url }) => void handle(url));

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return { ...status, reset: () => setStatus({ state: 'idle' }) };
}

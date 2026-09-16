import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';

// Lets the in-app browser hand control back to the app when the OAuth
// redirect lands, instead of leaving the tab open behind the app.
WebBrowser.maybeCompleteAuthSession();

export type Profile = {
  id: string;
  fullName: string;
  initials: string;
  avatarBg: string;
  avatarFg: string;
};

type AuthResult = { error: string | null };

type AuthState = {
  /** Undefined until the first getSession() resolves; null once we know there's no session. */
  session: Session | null | undefined;
  /** The profiles row for the signed-in user. Lags session by one round trip right after sign-up. */
  profile: Profile | null;
  /** inviteCode, if present and valid, joins that project as a member instead of seeding a new demo project — see handle_new_user() in migration 0011. */
  signUp: (email: string, password: string, fullName: string, inviteCode?: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  /** Opens Google's consent screen in a system browser sheet and exchanges the returned code for a session. Cancelling is not an error. */
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

// Exported for dev/PreviewGate only, which supplies a fixture value so the
// real screens can be looked at without a session. Everything else must
// still go through the hook below — it throws outside a provider, which is
// the check worth keeping.
export const AuthContext = createContext<AuthState | null>(null);

function toProfile(row: {
  id: string;
  full_name: string;
  initials: string;
  avatar_bg: string;
  avatar_fg: string;
}): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    initials: row.initials,
    avatarBg: row.avatar_bg,
    avatarFg: row.avatar_fg,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, full_name, initials, avatar_bg, avatar_fg')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setProfile(toProfile(data));
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  async function signUp(email: string, password: string, fullName: string, inviteCode?: string): Promise<AuthResult> {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, invite_code: inviteCode || undefined } },
    });
    return { error: error?.message ?? null };
  }

  async function signIn(email: string, password: string): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  /**
   * Three steps, because a mobile OAuth round trip isn't a redirect the way
   * it is on the web: ask Supabase for the consent URL (skipBrowserRedirect
   * — we open it ourselves), run it in a system browser sheet that returns
   * to our scheme, then trade the `code` it comes back with for a real
   * session. PKCE keeps that code useless to anyone who intercepts it; the
   * verifier never leaves this device (see lib/supabase.ts's flowType).
   */
  async function signInWithGoogle(): Promise<AuthResult> {
    const redirectTo = AuthSession.makeRedirectUri();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) return { error: error.message };
    if (!data?.url) return { error: 'Could not start Google sign-in.' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    // dismiss/cancel is the user backing out, not a failure to report.
    if (result.type !== 'success') return { error: null };

    const code = new URL(result.url).searchParams.get('code');
    if (!code) return { error: 'Google sign-in did not complete.' };

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    return { error: exchangeError?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, profile, signUp, signIn, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() must be called within an AuthProvider');
  }
  return ctx;
}

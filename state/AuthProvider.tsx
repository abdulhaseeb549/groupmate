import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

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

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, profile, signUp, signIn, signOut }}>
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

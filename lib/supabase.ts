import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Left uninitialized (rather than throwing here) when the env vars are
// missing, so importing this module never crashes the app on its own.
// App.tsx checks `isSupabaseConfigured` and shows a setup screen instead of
// mounting anything that would call `supabase` — see SetupNeededScreen.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        // AsyncStorage rather than SecureStore: it works on web too, which
        // this app previews in, and the session token isn't sensitive
        // enough to need SecureStore's stronger (but native-only,
        // size-limited) guarantees.
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // PKCE rather than the implicit default: the Google sign-in flow
        // hands back a one-time code that AuthProvider exchanges for a
        // session (see signInWithGoogle). Email/password sign-in is
        // unaffected by this setting.
        flowType: 'pkce',
      },
    })
  : (null as unknown as SupabaseClient);

// On a phone, supabase-js can't see the app going to the background, so it
// keeps (or loses) its token-refresh timer and socket blindly. Supabase's
// recommended React Native setup: refresh tokens only while in the
// foreground, and on returning, restart the refresh and reconnect Realtime
// straight away rather than waiting for a heartbeat to notice the socket
// died. The web build handles this itself through page visibility.
if (isSupabaseConfigured && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
      // Only if something is listening — an idle socket isn't worth opening.
      if (supabase.getChannels().length > 0) supabase.realtime.connect();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}

/**
 * Whether the Google provider is switched on for this Supabase project,
 * read from its public auth settings at runtime rather than baked in at
 * build time — so enabling Google in the dashboard makes the button appear
 * in APKs that are already installed. Any failure reads as "off": a missing
 * button is a safe default, and a button that errors on every tap is not.
 */
export async function isGoogleSignInEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey as string },
    });
    if (!response.ok) return false;
    const settings = await response.json();
    return settings?.external?.google === true;
  } catch {
    return false;
  }
}

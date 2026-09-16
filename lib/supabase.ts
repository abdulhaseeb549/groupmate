import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

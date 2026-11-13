import { AppState, AppStateStatus } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { freshChannel } from './chatRealtime';

/**
 * Who currently has the app open for this project — tracked at
 * ProjectRepository level (app-wide) rather than only while Chat is on
 * screen, so "online" matches ordinary chat-app semantics (has the app
 * open at all) instead of "has this exact conversation open".
 *
 * Presence, not a DB table: this is inherently ephemeral connection state,
 * not something worth persisting or subject to RLS — Realtime's presence
 * feature already scopes it to sockets subscribed to this exact channel,
 * which membership in the project's other channels already implies.
 *
 * The topic is fixed (every member must share it), so the channel comes
 * from freshChannel: switching away from a project and straight back
 * would otherwise be handed the old, still-closing channel.
 */
export function subscribeToPresence(
  projectId: string,
  userId: string,
  onChange: (onlineUserIds: Set<string>) => void
): () => void {
  let stopped = false;
  let channel: RealtimeChannel | null = null;

  function track() {
    // Only while the app is actually in the foreground: Realtime can
    // rejoin in the background (a reconnect after the OS woke the app for a
    // push), and that must not mark someone online who isn't looking.
    if (channel && AppState.currentState === 'active') {
      void channel.track({ online_at: new Date().toISOString() });
    }
  }

  void freshChannel(`project:${projectId}:presence`, { config: { presence: { key: userId } } }).then((created) => {
    if (stopped) {
      void supabase.removeChannel(created);
      return;
    }
    channel = created;
    created
      .on('presence', { event: 'sync' }, () => {
        onChange(new Set(Object.keys(created.presenceState())));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') track();
      });
  });

  // Realtime only notices a dropped socket via a missed heartbeat, which
  // can lag a real disconnect by up to a minute — too slow for "closed the
  // app" to read as offline. Backgrounding untracks immediately instead of
  // waiting on that timeout; foregrounding re-tracks. A force-quit or
  // uninstall still has to fall back to the heartbeat timeout, since there's
  // no JS left running to untrack with.
  const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (!channel) return;
    if (state === 'active') {
      track();
    } else if (state === 'background') {
      // Only real backgrounding: iOS reports 'inactive' for Control Centre,
      // a call banner or Face ID, which used to flicker you offline.
      void channel.untrack();
    }
  });

  return () => {
    stopped = true;
    appStateSubscription.remove();
    if (channel) void supabase.removeChannel(channel);
  };
}

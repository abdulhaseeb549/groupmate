import { supabase } from '../lib/supabase';

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
 */
export function subscribeToPresence(
  projectId: string,
  userId: string,
  onChange: (onlineUserIds: Set<string>) => void
): () => void {
  const channel = supabase.channel(`project:${projectId}:presence`, {
    config: { presence: { key: userId } },
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      onChange(new Set(Object.keys(channel.presenceState())));
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ online_at: new Date().toISOString() });
      }
    });

  return () => {
    void supabase.removeChannel(channel);
  };
}

export type TypingEvent = { userId: string; conversationKey: string };

/**
 * Broadcast, not postgres_changes — "someone is typing" is never worth
 * persisting, so this never touches a table. One channel per project
 * carries every conversation's typing events; the caller filters to the
 * one it's showing (see ChatScreen), same division of labour as
 * subscribeToMessages/belongsToConversation.
 */
export function subscribeToTyping(
  projectId: string,
  userId: string,
  onTyping: (event: TypingEvent) => void
): { sendTyping: (conversationKey: string) => void; unsubscribe: () => void } {
  const channel = supabase
    .channel(`project:${projectId}:typing`)
    .on('broadcast', { event: 'typing' }, ({ payload }) => {
      const event = payload as TypingEvent;
      if (event.userId !== userId) onTyping(event);
    })
    .subscribe();

  return {
    sendTyping: (conversationKey: string) => {
      void channel.send({ type: 'broadcast', event: 'typing', payload: { userId, conversationKey } });
    },
    unsubscribe: () => {
      void supabase.removeChannel(channel);
    },
  };
}

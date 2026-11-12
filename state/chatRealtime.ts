import { AppState, AppStateStatus } from 'react-native';
import type { RealtimeChannel, RealtimeChannelOptions } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { onMessagePush } from './chatSignals';
import { Message, MessageRow, Reaction, ReactionRow, toMessage, toReaction } from './messages';

/** Someone is typing — to one member (a DM) or, with recipientId null, to the group. */
export type TypingEvent = { userId: string; recipientId: string | null };

export type ChatEvent =
  | { type: 'message'; message: Message }
  | { type: 'messageDeleted'; messageId: string }
  | { type: 'reactionAdded'; reaction: Reaction }
  | { type: 'reactionRemoved'; reaction: Reaction }
  | { type: 'typing'; typing: TypingEvent }
  /**
   * Events may have been missed — the socket reconnected, the app came
   * back to the foreground, or a message push arrived. Realtime never
   * replays what it missed, so whoever shows chat data refetches.
   * conversationKey narrows it to one thread (a push); null means all.
   */
  | { type: 'resync'; conversationKey: string | null };

export type ChatHub = {
  /** Every chat event for this project. Listeners can attach before start(). Returns an unsubscribe function. */
  listen: (listener: (event: ChatEvent) => void) => () => void;
  /** Broadcast "I'm typing" — to one member, or to the group when recipientId is null. */
  sendTyping: (recipientId: string | null) => void;
  /** Opens the project's channels; returns the function that closes them. */
  start: () => () => void;
};

let topicCounter = 0;

/** A topic no other channel on this socket has, so a remount never gets handed a channel that is still closing. */
function uniqueTopic(base: string): string {
  topicCounter += 1;
  return `${base}:${Date.now().toString(36)}${topicCounter}${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * For topics that must stay fixed because other clients share them
 * (presence, typing broadcast). supabase.channel() hands back any channel
 * already registered under the same topic — including one still leaving
 * after a quick unmount, which never joins again — so any leftover is
 * removed first and a brand-new channel created.
 */
export async function freshChannel(topic: string, params?: RealtimeChannelOptions): Promise<RealtimeChannel> {
  const fullTopic = `realtime:${topic}`;
  const stale = supabase.getChannels().filter((c) => c.topic === fullTopic);
  await Promise.all(stale.map((c) => supabase.removeChannel(c)));
  return supabase.channel(topic, params);
}

/**
 * One long-lived set of chat channels per project, owned by
 * ChatUnreadProvider and shared with whichever ChatScreen is open, instead
 * of every screen opening (and racing to close) its own channels on mount.
 * Opening a thread therefore doesn't wait for a channel join, and switching
 * threads quickly can't leave a screen on a dead channel.
 */
export function createChatHub(projectId: string, userId: string): ChatHub {
  const listeners = new Set<(event: ChatEvent) => void>();
  let typingChannel: RealtimeChannel | null = null;

  function emit(event: ChatEvent) {
    for (const listener of Array.from(listeners)) listener(event);
  }

  function listen(listener: (event: ChatEvent) => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function sendTyping(recipientId: string | null) {
    const channel = typingChannel;
    // Only over a joined socket — otherwise realtime-js falls back to a REST
    // call per keystroke burst, which isn't worth it for a typing hint.
    if (!channel || channel.state !== 'joined') return;
    void channel.send({
      type: 'broadcast',
      event: 'typing',
      // conversationKey kept for clients still on the old build, which read
      // only that field (correct for the group thread).
      payload: { userId, recipientId, conversationKey: recipientId ? `dm:${recipientId}` : 'group' },
    });
  }

  function start() {
    let stopped = false;
    let hasConnectedBefore = false;

    const changes = supabase
      .channel(uniqueTopic(`project:${projectId}:chat`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
        (payload) => emit({ type: 'message', message: toMessage(payload.new as MessageRow) })
      )
      .on(
        // Unfiltered on purpose: Realtime can't apply a column filter to
        // DELETE, and under RLS payload.old carries only the primary key —
        // so a project_id-filtered DELETE listener never fires. Matching is
        // done by id on the client instead.
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const id = (payload.old as Partial<MessageRow>).id;
          if (id) emit({ type: 'messageDeleted', messageId: id });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `project_id=eq.${projectId}` },
        (payload) => emit({ type: 'reactionAdded', reaction: toReaction(payload.new as ReactionRow) })
      )
      .on(
        // Same as messages: unfiltered. The primary key is
        // (message_id, user_id, emoji), so the old row still has all three.
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        (payload) => {
          const old = payload.old as Partial<ReactionRow>;
          if (old.message_id && old.user_id && old.emoji) {
            emit({ type: 'reactionRemoved', reaction: toReaction(old as ReactionRow) });
          }
        }
      )
      .subscribe((status) => {
        if (stopped || status !== 'SUBSCRIBED') return;
        // A second SUBSCRIBED is a reconnect: refetch what was missed.
        if (hasConnectedBefore) emit({ type: 'resync', conversationKey: null });
        hasConnectedBefore = true;
      });

    void freshChannel(`project:${projectId}:typing`).then((channel) => {
      if (stopped) {
        void supabase.removeChannel(channel);
        return;
      }
      typingChannel = channel;
      channel
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const event = payload as { userId?: string; recipientId?: string | null; conversationKey?: string };
          if (!event.userId || event.userId === userId) return;
          // Older builds send only conversationKey ('group' or 'dm:<recipient>').
          const recipientId =
            event.recipientId !== undefined
              ? event.recipientId
              : event.conversationKey?.startsWith('dm:')
                ? event.conversationKey.slice(3)
                : null;
          emit({ type: 'typing', typing: { userId: event.userId, recipientId } });
        })
        .subscribe();
    });

    // Coming back to the foreground: don't wait for the socket to notice it
    // was dropped and rejoin — refetch straight away.
    let appState: AppStateStatus = AppState.currentState;
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      const wasAway = appState !== 'active';
      appState = next;
      if (next === 'active' && wasAway) emit({ type: 'resync', conversationKey: null });
    });

    // A message push can beat the Realtime insert (or arrive while the
    // socket is down): treat it as a cue to refetch that thread.
    const stopPush = onMessagePush((signal) => {
      if (signal.projectId === projectId) emit({ type: 'resync', conversationKey: signal.conversationKey });
    });

    return () => {
      stopped = true;
      appStateSubscription.remove();
      stopPush();
      void supabase.removeChannel(changes);
      if (typingChannel) {
        void supabase.removeChannel(typingChannel);
        typingChannel = null;
      }
    };
  }

  return { listen, sendTyping, start };
}

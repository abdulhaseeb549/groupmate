/**
 * App-wide chat signals that have to cross the gap between the push
 * notification layer (PushNotificationRegistrar, the notification handler)
 * and the chat screens, without either importing the other's React tree.
 * Plain module state on purpose: the notification handler runs outside
 * React entirely.
 */

/** A message push that arrived while the app was in the foreground. */
export type MessagePushSignal = { projectId: string; conversationKey: string };

const pushListeners = new Set<(signal: MessagePushSignal) => void>();

/** Called by PushNotificationRegistrar for every message push received in the foreground. */
export function emitMessagePush(signal: MessagePushSignal): void {
  for (const listener of pushListeners) listener(signal);
}

/** Subscribe to foreground message pushes. Returns an unsubscribe function. */
export function onMessagePush(listener: (signal: MessagePushSignal) => void): () => void {
  pushListeners.add(listener);
  return () => {
    pushListeners.delete(listener);
  };
}

type OpenConversation = { projectId: string; conversationKey: string };

let openConversation: OpenConversation | null = null;

/**
 * Which conversation is on screen right now — set by ChatScreen while it is
 * mounted (the Chat tab unmounts when another tab is active, so mounted
 * means visible). The notification handler reads this to skip the banner
 * for the thread you are already looking at.
 */
export function setOpenConversation(next: OpenConversation): () => void {
  openConversation = next;
  return () => {
    // Only clear if nothing newer replaced it (a quick switch between
    // threads mounts the next screen before the old one's cleanup runs).
    if (openConversation === next) openConversation = null;
  };
}

export function isConversationOpen(projectId: string, conversationKey: string): boolean {
  return openConversation !== null && openConversation.projectId === projectId && openConversation.conversationKey === conversationKey;
}

/** The conversation key a message push points at, from the receiver's point of view (see notifyMessage). */
export function pushConversationKey(conversationOtherUserId: string | null | undefined): string {
  return conversationOtherUserId ? `dm:${conversationOtherUserId}` : 'group';
}

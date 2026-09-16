import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Conversation,
  ConversationSummary,
  conversationKey,
  conversationOf,
  fetchConversationSummaries,
  messagePreview,
  subscribeToMessages,
} from './messages';

type ChatUnreadState = {
  /** Newest message per conversation — powers the chat list's previews as well as its dots. */
  summaries: Record<string, ConversationSummary>;
  hasUnread: boolean;
  isUnread: (conversation: Conversation) => boolean;
  /** Call when a conversation is opened — stamps it read locally and persists that. */
  markRead: (conversation: Conversation) => void;
};

const EMPTY: ChatUnreadState = {
  summaries: {},
  hasUnread: false,
  isUnread: () => false,
  markRead: () => {},
};

const ChatUnreadContext = createContext<ChatUnreadState | null>(null);

function storageKey(projectId: string, userId: string) {
  return `groupmate:lastRead:${projectId}:${userId}`;
}

/**
 * Unread state for this project's conversations.
 *
 * Deliberately device-local (AsyncStorage) rather than a read-receipts
 * table: what's being fixed here is "a message arrived and nothing told
 * me", which only needs to know what *this* device has opened. A server
 * side would additionally promise read state that follows you between
 * devices and is visible to the sender — both real features, and both a
 * schema decision rather than a bug fix, so they're not smuggled in here.
 *
 * Consequence worth knowing: reinstalling the app marks everything read,
 * since the last-read stamps live with the install.
 */
export function ChatUnreadProvider({
  projectId,
  userId,
  children,
}: {
  projectId: string;
  userId: string | undefined;
  children: ReactNode;
}) {
  const [summaries, setSummaries] = useState<Record<string, ConversationSummary>>({});
  const [lastRead, setLastRead] = useState<Record<string, string>>({});
  // Until the stored stamps have loaded, every thread would look unread —
  // so nothing is reported unread before this flips.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    AsyncStorage.getItem(storageKey(projectId, userId))
      .then((raw) => {
        if (cancelled) return;
        setLastRead(raw ? (JSON.parse(raw) as Record<string, string>) : {});
      })
      .catch(() => {
        // A corrupt or unreadable store just means nothing is known to be
        // read yet; it must never take the chat list down with it.
        if (!cancelled) setLastRead({});
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    fetchConversationSummaries(projectId, userId)
      .then((next) => {
        if (!cancelled) setSummaries(next);
      })
      .catch(() => {
        if (!cancelled) setSummaries({});
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, userId]);

  // Live, so a message that lands while you are on another tab lights the
  // Chat dot immediately instead of at the next cold start.
  useEffect(() => {
    if (!userId) return;
    return subscribeToMessages(
      projectId,
      (message) => {
        const conversation = conversationOf(message, userId);
        const key = conversationKey(conversation);
        setSummaries((prev) => {
          const existing = prev[key];
          if (existing && existing.lastAt > message.createdAt) return prev;
          return {
            ...prev,
            [key]: {
              key,
              conversation,
              preview: messagePreview(message),
              lastAt: message.createdAt,
              lastAuthorId: message.authorId,
            },
          };
        });
      },
      undefined,
      // Its own topic: ChatScreen watches the same project concurrently.
      'unread'
    );
  }, [projectId, userId]);

  const markRead = useCallback(
    (conversation: Conversation) => {
      if (!userId) return;
      const key = conversationKey(conversation);
      setLastRead((prev) => {
        const next = { ...prev, [key]: new Date().toISOString() };
        void AsyncStorage.setItem(storageKey(projectId, userId), JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [projectId, userId]
  );

  const value = useMemo<ChatUnreadState>(() => {
    function isUnread(conversation: Conversation) {
      if (!loaded || !userId) return false;
      const key = conversationKey(conversation);
      const summary = summaries[key];
      if (!summary) return false;
      // Your own message is never unread to you — otherwise sending one
      // lights your own dot.
      if (summary.lastAuthorId === userId) return false;
      const seenAt = lastRead[key];
      return !seenAt || summary.lastAt > seenAt;
    }

    return {
      summaries,
      hasUnread: Object.values(summaries).some((s) => isUnread(s.conversation)),
      isUnread,
      markRead,
    };
  }, [summaries, lastRead, loaded, userId, markRead]);

  return <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>;
}

/**
 * Returns inert defaults rather than throwing when there's no provider —
 * StudyScreen renders both inside a project and in the no-project shell,
 * where no conversation can exist yet.
 */
export function useChatUnread(): ChatUnreadState {
  return useContext(ChatUnreadContext) ?? EMPTY;
}

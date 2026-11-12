import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Conversation,
  ConversationSummary,
  conversationKey,
  conversationOf,
  fetchConversationSummaries,
  messagePreview,
} from './messages';
import { ChatHub, createChatHub } from './chatRealtime';

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

/** Kept apart from the unread state so the open thread doesn't re-render every time a summary changes. */
const ChatHubContext = createContext<ChatHub | null>(null);

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

  // The project's one set of chat channels (see state/chatRealtime.ts).
  // Created during render — it's only a listener registry until start() —
  // so a ChatScreen mounting in the same commit can attach to it in its own
  // effect, which runs before this provider's.
  const hub = useMemo(() => (userId ? createChatHub(projectId, userId) : null), [projectId, userId]);

  useEffect(() => {
    if (!hub) return;
    return hub.start();
  }, [hub]);

  // Live, so a message that lands while you are on another tab lights the
  // Chat dot immediately instead of at the next cold start.
  useEffect(() => {
    if (!hub || !userId) return;
    let cancelled = false;
    const unsubscribe = hub.listen((event) => {
      if (event.type === 'message') {
        const message = event.message;
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
      } else if (event.type === 'resync') {
        // Realtime doesn't replay inserts missed while the socket was down
        // (backgrounded app, dropped connection), and this provider isn't
        // remounted by switching tabs — so a reconnect, a return to the
        // foreground, or a push refetches the previews.
        fetchConversationSummaries(projectId, userId)
          .then((next) => {
            if (!cancelled) setSummaries(next);
          })
          .catch(() => {});
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hub, projectId, userId]);

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

  return (
    <ChatHubContext.Provider value={hub}>
      <ChatUnreadContext.Provider value={value}>{children}</ChatUnreadContext.Provider>
    </ChatHubContext.Provider>
  );
}

/** The project's shared chat channels, or null outside a project / before sign-in. */
export function useChatHub(): ChatHub | null {
  return useContext(ChatHubContext);
}

/**
 * Returns inert defaults rather than throwing when there's no provider —
 * StudyScreen renders both inside a project and in the no-project shell,
 * where no conversation can exist yet.
 */
export function useChatUnread(): ChatUnreadState {
  return useContext(ChatUnreadContext) ?? EMPTY;
}

import { memo, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Linking,
  ListRenderItem,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canFadeShadowed } from '../components/fadeLayer';
import { Avatar } from '../components/Avatar';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Glass, GlassButton, GlassScene, GlassTarget } from '../components/Glass';
import { Icon, IconName } from '../components/Icon';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { TaskStatusDot } from '../components/TaskStatusDot';
import { Member } from '../data/member';
import { Priority, Task } from '../data/tasks';
import { useAuth } from '../state/AuthProvider';
import {
  addReaction,
  belongsToConversation,
  Conversation,
  conversationKey,
  deleteMessage,
  fetchMessages,
  fetchReactions,
  getAttachmentUrl,
  insertMessage,
  mergeLatestPage,
  Message,
  MESSAGE_PAGE_SIZE,
  Reaction,
  removeReaction,
  sendAttachment,
  sendMessage,
} from '../state/messages';
import { ChatHub } from '../state/chatRealtime';
import { setOpenConversation } from '../state/chatSignals';
import { useChatHub, useChatUnread } from '../state/chatUnread';
import { notifyMessage } from '../state/pushNotifications';
import { pickDocument, pickMedia } from '../utils/filePicker';
import { useProject } from '../state/ProjectRepository';
import { colors, gradients, layout, radius, type } from '../theme';
import { formatTime } from '../utils/dates';

type Props = {
  conversation: Conversation;
  onBack: () => void;
};

/** Where a long-pressed bubble sits on screen, so the reaction picker can open against it rather than in the middle of the screen. */
type PickerAnchor = {
  messageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isOwn: boolean;
  /** A text message's words, so the hold menu can lift a copy of the bubble above the dimmed chat. Null for tasks and files. */
  body: string | null;
  /** Whether the held bubble opens its stack (its corners differ). */
  first: boolean;
};

const REACTION_PALETTE = ['❤️', '👍', '🎉', '👏', '😄'];

/** Photos and video go to the gallery grid; the rest to the document browser. */
type AttachKind = { label: string; icon: IconName; source: { via: 'media'; kind: 'image' | 'video' } | { via: 'document'; mime: string } };

const ATTACH_KINDS: AttachKind[] = [
  { label: 'Files', icon: 'document', source: { via: 'document', mime: '*/*' } },
  { label: 'Images', icon: 'image', source: { via: 'media', kind: 'image' } },
  { label: 'Audio', icon: 'audio', source: { via: 'document', mime: 'audio/*' } },
  { label: 'Video', icon: 'video', source: { via: 'media', kind: 'video' } },
];

/** What a thread last showed, kept in memory so reopening it paints at once while the fresh page loads. */
type CachedThread = { messages: Message[]; reactions: Reaction[]; hasMore: boolean };

const threadCache = new Map<string, CachedThread>();

function threadCacheKey(projectId: string, userId: string, key: string) {
  return `${projectId}:${userId}:${key}`;
}

const NO_REACTIONS: Reaction[] = [];

/** Most messages kept per thread in the in-memory cache. */
const CACHE_LIMIT = MESSAGE_PAGE_SIZE * 2;

const MAINTAIN_POSITION = { minIndexForVisible: 0 };

function keyExtractor(message: Message) {
  return message.id;
}

function sameReaction(a: Reaction, b: Reaction) {
  return a.messageId === b.messageId && a.userId === b.userId && a.emoji === b.emoji;
}

/** How close to the bottom (in px) still counts as "reading the latest", so a new message scrolls into view. */
const NEAR_BOTTOM = 160;

/** A callback whose identity never changes but always runs the latest render's code — lets memoized rows skip re-rendering. */
function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

/**
 * One conversation's message list + composer — either the project's group
 * chat or a 1:1 with one other member (see ChatListScreen for where a
 * conversation gets picked). A message is either plain text, a shared
 * task-claim card, or a file (see state/messages.ts).
 *
 * Opens on the newest page only (older pages load as you scroll up), and
 * shows the last-seen copy of the thread instantly from memory while that
 * page loads. A sent message is shown from the insert's returned row, not
 * after the Realtime echo; the echo is deduped by id. Live events come
 * from the project's shared chat hub (state/chatRealtime.ts), which also
 * says when to refetch: on reconnect, on returning to the foreground, and
 * when a message push for this thread arrives.
 */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local calendar day of a timestamp, for grouping messages under a date. */
/** Messages from one person within this long of each other share one bubble stack. */
const GROUP_WINDOW_MS = 10 * 60 * 1000;

/** True when b continues a's stack: same person, same day, close in time. A shared task always stands alone. */
function sameGroup(a: Message | undefined, b: Message | undefined): boolean {
  if (!a || !b) return false;
  if (a.authorId !== b.authorId) return false;
  if (a.sharedTaskId !== null || b.sharedTaskId !== null) return false;
  if (dayKey(a.createdAt) !== dayKey(b.createdAt)) return false;
  return Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < GROUP_WINDOW_MS;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "Today", "Yesterday", "Mon 10 Nov", or "10 Nov 2025" for another year. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const key = dayKey(iso);
  if (key === dayKey(today.toISOString())) return 'Today';
  if (key === dayKey(yesterday.toISOString())) return 'Yesterday';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === today.getFullYear() ? `${WEEKDAYS[d.getDay()]} ${base}` : `${base} ${d.getFullYear()}`;
}

export function ChatScreen({ conversation, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { project, tasks, members, membersById, claimTask, onlineUserIds } = useProject();
  const { session, profile } = useAuth();
  const hub = useChatHub();
  const { markRead } = useChatUnread();
  const currentUserId = session?.user.id;
  const convKey = conversationKey(conversation);
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const [messages, setMessagesState] = useState<Message[] | null>(() =>
    currentUserId ? (threadCache.get(threadCacheKey(project.id, currentUserId, convKey))?.messages ?? null) : null
  );
  const [reactions, setReactionsState] = useState<Reaction[]>(() =>
    currentUserId ? (threadCache.get(threadCacheKey(project.id, currentUserId, convKey))?.reactions ?? []) : []
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [claimedTask, setClaimedTask] = useState<Task | null>(null);
  const [anchor, setAnchor] = useState<PickerAnchor | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const lastTypingSentRef = useRef(0);
  // Messages already on screen when the thread opened. Anything not in here
  // is genuinely new and animates in; history doesn't re-animate on scroll.
  const settledIdsRef = useRef<Set<string>>(new Set());

  // Mirrors of the list state, so async loads and Realtime events always
  // build on the latest list rather than a stale render's copy.
  const messagesRef = useRef<Message[] | null>(messages);
  const reactionsRef = useRef<Reaction[]>(reactions);
  const hasMoreRef = useRef(false);
  /** Identity of the thread currently loaded — async work started for an older one checks this and drops its result. */
  const threadRef = useRef<{ cacheKey: string } | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshAgainRef = useRef(false);
  /** Messages added / removed while a refresh was in flight, re-applied on top of its (older) result. */
  const arrivedRef = useRef<Message[]>([]);
  const removedRef = useRef<Set<string>>(new Set());
  /** Reaction changes (live or your own) seen while a reactions fetch was in flight, re-applied on its older snapshot. */
  const reactionOpsRef = useRef<Set<{ reaction: Reaction; add: boolean }[]>>(new Set());
  const loadingOlderRef = useRef(false);
  // Scroll bookkeeping: until the user drags, every size change jumps
  // straight to the bottom (no animated slide through history on open).
  const userScrolledRef = useRef(false);
  const nearBottomRef = useRef(true);
  const lastBottomIdRef = useRef<string | null>(null);

  const commit = useCallback((patch: { messages?: Message[] | null; reactions?: Reaction[]; hasMore?: boolean }) => {
    if (patch.messages !== undefined) {
      messagesRef.current = patch.messages;
      setMessagesState(patch.messages);
    }
    if (patch.reactions !== undefined) {
      reactionsRef.current = patch.reactions;
      setReactionsState(patch.reactions);
    }
    if (patch.hasMore !== undefined) hasMoreRef.current = patch.hasMore;
    const thread = threadRef.current;
    const all = messagesRef.current;
    if (thread && all) {
      // Only the newest stretch is kept, so a thread scrolled far back
      // doesn't reopen by rendering its whole history.
      const kept = all.length > CACHE_LIMIT ? all.slice(-CACHE_LIMIT) : all;
      const keptIds = kept === all ? null : new Set(kept.map((m) => m.id));
      threadCache.set(thread.cacheKey, {
        messages: kept,
        reactions: keptIds ? reactionsRef.current.filter((r) => keptIds.has(r.messageId)) : reactionsRef.current,
        hasMore: kept !== all || hasMoreRef.current,
      });
    }
  }, []);

  const addMessage = useCallback(
    (message: Message) => {
      if (refreshInFlightRef.current) arrivedRef.current.push(message);
      // Still on the first load: it folds this in when it lands.
      if (messagesRef.current === null) return;
      commit({ messages: insertMessage(messagesRef.current, message) });
    },
    [commit]
  );

  const removeMessage = useCallback(
    (messageId: string) => {
      arrivedRef.current = arrivedRef.current.filter((m) => m.id !== messageId);
      if (refreshInFlightRef.current) removedRef.current.add(messageId);
      const current = messagesRef.current;
      if (!current || !current.some((m) => m.id === messageId)) return;
      commit({
        messages: current.filter((m) => m.id !== messageId),
        reactions: reactionsRef.current.filter((r) => r.messageId !== messageId),
      });
    },
    [commit]
  );

  const noteReactionOp = useCallback((reaction: Reaction, add: boolean) => {
    for (const ops of reactionOpsRef.current) ops.push({ reaction, add });
  }, []);

  /** Reactions for just these messages, replacing what's held for them. A failure only means no pills until the next refresh — never an error screen. */
  const loadReactions = useCallback(
    async (messageIds: string[], thread: { cacheKey: string }) => {
      if (messageIds.length === 0) return;
      const ops: { reaction: Reaction; add: boolean }[] = [];
      reactionOpsRef.current.add(ops);
      try {
        const fetched = await fetchReactions(messageIds);
        if (threadRef.current !== thread) return;
        const ids = new Set(messageIds);
        const loaded = new Set((messagesRef.current ?? []).map((m) => m.id));
        let next = [...reactionsRef.current.filter((r) => !ids.has(r.messageId) && loaded.has(r.messageId)), ...fetched];
        for (const { reaction, add } of ops) {
          if (!ids.has(reaction.messageId)) continue;
          next = next.filter((r) => !sameReaction(r, reaction));
          if (add) next.push(reaction);
        }
        commit({ reactions: next });
      } catch {
        // Non-fatal on purpose.
      } finally {
        reactionOpsRef.current.delete(ops);
      }
    },
    [commit]
  );

  /** Fetches the newest page and folds it into what's shown. Coalesces: a call while one is running just schedules one more pass. */
  const refreshLatest = useCallback(async () => {
    const thread = threadRef.current;
    if (!thread || !currentUserId) return;
    if (refreshInFlightRef.current) {
      refreshAgainRef.current = true;
      return;
    }
    refreshInFlightRef.current = true;
    try {
      do {
        refreshAgainRef.current = false;
        arrivedRef.current = [];
        removedRef.current = new Set();
        const page = await fetchMessages(project.id, currentUserId, conversationRef.current);
        if (threadRef.current !== thread) return;
        const firstLoad = messagesRef.current === null;
        const merged = mergeLatestPage(messagesRef.current ?? [], page);
        let next = merged.messages;
        for (const m of arrivedRef.current) next = insertMessage(next, m);
        if (removedRef.current.size > 0) next = next.filter((m) => !removedRef.current.has(m.id));
        if (firstLoad) for (const m of next) settledIdsRef.current.add(m.id);
        const loaded = new Set(next.map((m) => m.id));
        commit({
          messages: next,
          hasMore: merged.hasMore,
          reactions: reactionsRef.current.filter((r) => loaded.has(r.messageId)),
        });
        setLoadError(null);
        void loadReactions(
          page.messages.map((m) => m.id),
          thread
        );
      } while (refreshAgainRef.current && threadRef.current === thread);
    } catch (err) {
      // With a cached copy on screen, a failed refresh just leaves it there.
      if (threadRef.current === thread && messagesRef.current === null) {
        setLoadError(err instanceof Error ? err.message : 'Could not load messages.');
      }
    } finally {
      if (threadRef.current === thread) refreshInFlightRef.current = false;
    }
  }, [project.id, currentUserId, commit, loadReactions]);

  /** The page just older than the oldest message shown — called as the user scrolls near the top. */
  const loadOlder = useCallback(async () => {
    const thread = threadRef.current;
    const current = messagesRef.current;
    if (!thread || !currentUserId || !current || current.length === 0) return;
    if (!hasMoreRef.current || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    try {
      const page = await fetchMessages(project.id, currentUserId, conversationRef.current, { before: current[0].createdAt });
      if (threadRef.current !== thread) return;
      const latest = messagesRef.current ?? [];
      const have = new Set(latest.map((m) => m.id));
      const older = page.messages.filter((m) => !have.has(m.id));
      for (const m of older) settledIdsRef.current.add(m.id);
      commit({ messages: [...older, ...latest], hasMore: page.hasMore });
      void loadReactions(
        older.map((m) => m.id),
        thread
      );
    } catch {
      // Scrolling up again retries.
    } finally {
      if (threadRef.current === thread) loadingOlderRef.current = false;
    }
  }, [project.id, currentUserId, commit, loadReactions]);

  // (Re)load whenever the thread changes: cached copy first, then the newest page.
  useEffect(() => {
    if (!currentUserId) return;
    const thread = { cacheKey: threadCacheKey(project.id, currentUserId, convKey) };
    threadRef.current = thread;
    refreshInFlightRef.current = false;
    refreshAgainRef.current = false;
    arrivedRef.current = [];
    removedRef.current = new Set();
    loadingOlderRef.current = false;
    userScrolledRef.current = false;
    nearBottomRef.current = true;
    lastBottomIdRef.current = null;
    const cached = threadCache.get(thread.cacheKey);
    settledIdsRef.current = new Set(cached ? cached.messages.map((m) => m.id) : []);
    commit({ messages: cached?.messages ?? null, reactions: cached?.reactions ?? [], hasMore: cached?.hasMore ?? false });
    setLoadError(null);
    void refreshLatest();
    return () => {
      if (threadRef.current === thread) threadRef.current = null;
    };
  }, [project.id, currentUserId, convKey, commit, refreshLatest]);

  // Live events for this thread, from the project's shared channels.
  useEffect(() => {
    if (!hub || !currentUserId) return;
    return hub.listen((event) => {
      switch (event.type) {
        case 'message':
          if (belongsToConversation(event.message, currentUserId, conversationRef.current)) addMessage(event.message);
          break;
        case 'messageDeleted':
          // Fires for the deleter's own client too, so the optimistic
          // removal in confirmDelete and this are both no-ops on whichever
          // runs second.
          removeMessage(event.messageId);
          break;
        case 'reactionAdded': {
          const { reaction } = event;
          if (!messagesRef.current?.some((m) => m.id === reaction.messageId)) return;
          noteReactionOp(reaction, true);
          if (reactionsRef.current.some((r) => sameReaction(r, reaction))) return;
          commit({ reactions: [...reactionsRef.current, reaction] });
          break;
        }
        case 'reactionRemoved': {
          const { reaction } = event;
          noteReactionOp(reaction, false);
          if (!reactionsRef.current.some((r) => sameReaction(r, reaction))) return;
          commit({ reactions: reactionsRef.current.filter((r) => !sameReaction(r, reaction)) });
          break;
        }
        case 'resync':
          if (event.conversationKey === null || event.conversationKey === convKey) void refreshLatest();
          break;
      }
    });
  }, [hub, currentUserId, convKey, addMessage, removeMessage, commit, refreshLatest, noteReactionOp]);

  // Read while you're looking at it: stamped as messages land, when the app
  // goes to the background, and when this thread closes however that
  // happens (Back, a notification tap to another thread, Share to chat).
  const lastMessageId = messages && messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (lastMessageId) markRead(conversationRef.current);
  }, [lastMessageId, markRead]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') markRead(conversationRef.current);
    });
    return () => {
      sub.remove();
      markRead(conversationRef.current);
    };
  }, [markRead]);

  // With the keyboard up, the home-indicator inset is under the keyboard:
  // keeping it left an empty strip between the composer and the keys.
  const [keyboardUp, setKeyboardUp] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Tells the notification handler which thread is on screen, so a push
  // for it doesn't also pop a banner over the conversation itself.
  useEffect(() => setOpenConversation({ projectId: project.id, conversationKey: convKey }), [project.id, convKey]);

  const handleClaimed = useStableCallback((task: Task) => {
    setClaimedTask(task);
  });

  const stableClaim = useStableCallback((taskId: string) => claimTask(taskId));

  const toggleReaction = useStableCallback(async (messageId: string, emoji: string) => {
    if (!currentUserId) return;
    const mineReaction: Reaction = { messageId, userId: currentUserId, emoji };
    const mine = reactionsRef.current.some((r) => sameReaction(r, mineReaction));
    // Optimistic, same as the rest of this app's simple toggles — reverted on failure below.
    noteReactionOp(mineReaction, !mine);
    commit({
      reactions: mine
        ? reactionsRef.current.filter((r) => !sameReaction(r, mineReaction))
        : [...reactionsRef.current, mineReaction],
    });
    try {
      if (mine) {
        await removeReaction(messageId, currentUserId, emoji);
      } else {
        await addReaction(messageId, project.id, currentUserId, emoji);
      }
    } catch {
      noteReactionOp(mineReaction, mine);
      commit({
        reactions: mine
          ? [...reactionsRef.current.filter((r) => !sameReaction(r, mineReaction)), mineReaction]
          : reactionsRef.current.filter((r) => !sameReaction(r, mineReaction)),
      });
    }
  });

  const markSettled = useStableCallback((messageId: string) => {
    settledIdsRef.current.add(messageId);
  });

  async function confirmDelete() {
    const messageId = deletingId;
    if (!messageId) return;
    setDeletingId(null);
    setDeleteError(null);
    const removed = messagesRef.current?.find((m) => m.id === messageId) ?? null;
    const removedReactions = reactionsRef.current.filter((r) => r.messageId === messageId);
    // Optimistic, same as removeTask — the RLS delete is scoped to your
    // own messages, so this only fails on something like a dropped
    // connection, not a permissions surprise.
    removeMessage(messageId);
    try {
      await deleteMessage(messageId);
    } catch (err) {
      if (removed) {
        removedRef.current.delete(messageId);
        addMessage(removed);
        commit({ reactions: [...reactionsRef.current.filter((r) => r.messageId !== messageId), ...removedReactions] });
      }
      setDeleteError(err instanceof Error ? err.message : 'Could not unsend this message.');
    }
  }

  const title = conversation.type === 'group' ? 'Team chat' : (membersById[conversation.otherUserId]?.name ?? 'Direct message');
  const hereNow = members.filter((m) => m.id !== currentUserId && onlineUserIds.has(m.id)).length;
  // The capsule's faces: the other person in a DM; in the group, up to three
  // teammates, the ones here now first.
  const headerFaces = useMemo(() => {
    if (conversation.type === 'dm') {
      const other = membersById[conversation.otherUserId];
      return other ? [other] : [];
    }
    return members
      .filter((m) => m.id !== currentUserId)
      .sort((a, b) => (onlineUserIds.has(a.id) ? 0 : 1) - (onlineUserIds.has(b.id) ? 0 : 1))
      .slice(0, 3);
  }, [conversation, members, membersById, currentUserId, onlineUserIds]);
  // Real presence (state/presence.ts) in both kinds of thread — never this
  // device's own socket state, which read as "online" no matter who else
  // had the app open. A DM: is the other person here. The group: is
  // anyone other than you here.
  const otherOnline =
    conversation.type === 'dm'
      ? onlineUserIds.has(conversation.otherUserId)
      : members.some((m) => m.id !== currentUserId && onlineUserIds.has(m.id));

  // Throttled, not per-keystroke — a broadcast every 2.5s is plenty to keep
  // the other side's 3s timeout alive without spamming the channel.
  function handleInputChange(text: string) {
    setInput(text);
    if (text.trim().length === 0) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2500) {
      lastTypingSentRef.current = now;
      hub?.sendTyping(conversation.type === 'dm' ? conversation.otherUserId : null);
    }
  }

  /**
   * Fire-and-forget push to everyone else in this conversation — the
   * sender's own display name and the text just sent are already in
   * scope here, so there's no need to re-fetch anything to write the
   * notification (see state/pushNotifications.ts). A group thread loops
   * every member but the sender; a DM has exactly one recipient.
   */
  function notifyOthers(preview: string) {
    if (!currentUserId) return;
    const senderName = profile?.fullName ?? 'Someone';
    if (conversation.type === 'dm') {
      notifyMessage(conversation.otherUserId, senderName, preview, project.id, currentUserId);
    } else {
      for (const member of members) {
        if (member.id === currentUserId) continue;
        notifyMessage(member.id, senderName, preview, project.id);
      }
    }
  }

  async function handleSend() {
    const body = input.trim();
    if (!body || sending || !currentUserId) return;
    setSending(true);
    setInput('');
    setAttachError(null);
    try {
      const sent = await sendMessage(project.id, currentUserId, body, conversation.type === 'dm' ? conversation.otherUserId : null);
      // Shown now from the inserted row; the Realtime echo is deduped by id.
      addMessage(sent);
      // Sent while the thread had failed to load: load it now, so the
      // message doesn't vanish into an empty error screen.
      if (messagesRef.current === null) {
        setLoadError(null);
        void refreshLatest();
      }
      notifyOthers(body);
    } catch {
      // Put the text back, but never over something typed since.
      setInput((current) => (current.trim().length === 0 ? body : current));
      setAttachError('Message not sent. Check your connection and try again.');
    }
    setSending(false);
  }

  async function handleAttach(source: AttachKind['source']) {
    if (attaching || !currentUserId) return;
    setAttachError(null);
    const { file, error } =
      source.via === 'media' ? await pickMedia(source.kind) : await pickDocument(source.mime);
    if (error) {
      setAttachError(error);
      return;
    }
    if (!file) return;
    setAttaching(true);
    try {
      const sent = await sendAttachment(project.id, currentUserId, file, conversation.type === 'dm' ? conversation.otherUserId : null);
      addMessage(sent);
      notifyOthers(`Sent ${file.filename}`);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Could not send that file.');
    }
    setAttaching(false);
  }

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, Reaction[]>();
    for (const r of reactions) {
      const list = map.get(r.messageId);
      if (list) list.push(r);
      else map.set(r.messageId, [r]);
    }
    return map;
  }, [reactions]);

  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const renderItem = useCallback<ListRenderItem<Message>>(
    ({ item, index }) => {
      const prevItem = index > 0 && messages ? messages[index - 1] : undefined;
      const nextItem = messages && index + 1 < messages.length ? messages[index + 1] : undefined;
      const newDay = !prevItem || dayKey(prevItem.createdAt) !== dayKey(item.createdAt);
      const first = !sameGroup(prevItem, item);
      const last = !sameGroup(item, nextItem);
      const sharedTask = item.sharedTaskId ? (tasksById.get(item.sharedTaskId) ?? null) : null;
      const row = (
        <MessageRow
          message={item}
          isOwn={item.authorId === currentUserId}
          author={membersById[item.authorId]}
          first={first}
          last={last}
          spacing={index === 0 ? 0 : first ? 14 : 3}
          sharedTask={sharedTask}
          membersById={membersById}
          onClaim={stableClaim}
          onOpen={setOpenTaskId}
          onClaimed={handleClaimed}
          reactions={reactionsByMessage.get(item.id) ?? NO_REACTIONS}
          currentUserId={currentUserId}
          onToggleReaction={toggleReaction}
          onAnchor={setAnchor}
          isNew={!settledIdsRef.current.has(item.id)}
          onSettled={markSettled}
        />
      );
      if (!newDay) return row;
      return (
        <View>
          <View style={[styles.dayRow, index === 0 && styles.dayRowFirst]} accessibilityRole="header">
            <View style={styles.dayChip}>
              <Text style={styles.dayText}>{dayLabel(item.createdAt)}</Text>
            </View>
          </View>
          {row}
        </View>
      );
    },
    [messages, tasksById, currentUserId, membersById, stableClaim, handleClaimed, reactionsByMessage, toggleReaction, markSettled]
  );

  const handleContentSizeChange = useStableCallback(() => {
    const list = listRef.current;
    const current = messagesRef.current;
    if (!list || !current || current.length === 0) return;
    const last = current[current.length - 1];
    if (!userScrolledRef.current) {
      // Opening: land on the newest message without sliding through history.
      list.scrollToEnd({ animated: false });
      lastBottomIdRef.current = last.id;
      return;
    }
    if (last.id === lastBottomIdRef.current) return;
    lastBottomIdRef.current = last.id;
    // A new message: follow it if you were reading the bottom, or sent it.
    if (nearBottomRef.current || last.authorId === currentUserId) list.scrollToEnd({ animated: true });
  });

  const handleScroll = useStableCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    nearBottomRef.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_BOTTOM;
    // Only once the user has scrolled themselves: the list starts at the
    // top for a frame before it jumps to the bottom, which must not count.
    if (userScrolledRef.current && contentOffset.y < layoutMeasurement.height) void loadOlder();
  });

  const handleScrollBeginDrag = useStableCallback(() => {
    userScrolledRef.current = true;
  });

  // The typing bubble grows the list without a new message: keep it in view
  // if you were reading the bottom.
  const followTyping = useStableCallback(() => {
    if (nearBottomRef.current) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  });

  const listContentStyle = useMemo(
    () => [styles.list, { paddingTop: headerHeight + 8, paddingBottom: composerHeight + 12 }],
    [headerHeight, composerHeight]
  );

  const canSend = input.trim().length > 0 && !sending;

  // Which emoji you've already put on the held message, lit in the hold menu.
  const heldMine = useMemo(() => {
    const set = new Set<string>();
    if (!anchor) return set;
    for (const r of reactionsByMessage.get(anchor.messageId) ?? NO_REACTIONS) {
      if (r.userId === currentUserId) set.add(r.emoji);
    }
    return set;
  }, [anchor, reactionsByMessage, currentUserId]);

  return (
    <>
      <KeyboardAvoider style={styles.screen}>
        <GlassScene>
          {/* The messages fill the whole screen and slide under the glass header
              and composer, so the blur has something real to blur. */}
          <GlassTarget>
            {messages === null && loadError ? (
              <View style={[styles.centerBox, { paddingTop: headerHeight, paddingBottom: composerHeight }]}>
                <Icon name="exclamation" size={20} color={colors.redText} strokeWidth={2.2} />
                <Text style={[type.body, styles.muted, styles.centerText]}>{loadError}</Text>
                <Pressable
                  onPress={() => {
                    setLoadError(null);
                    void refreshLatest();
                  }}
                  accessibilityRole="button"
                  hitSlop={8}
                  style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
                >
                  <Text style={[type.button, styles.retryText]}>Try again</Text>
                </Pressable>
              </View>
            ) : messages === null ? (
              <View style={[styles.centerBox, { paddingTop: headerHeight, paddingBottom: composerHeight }]}>
                <ActivityIndicator color={colors.purple} />
              </View>
            ) : messages.length === 0 ? (
              <View style={[styles.centerBox, { paddingTop: headerHeight, paddingBottom: composerHeight }]}>
                <View style={styles.emptyTile}>
                  <Icon name="chat" size={22} color={colors.purple} strokeWidth={1.8} />
                </View>
                <Text style={[type.taskTitle, styles.ink]}>No messages yet</Text>
                <Text style={[type.caption, styles.muted, styles.centerText]}>
                  {conversation.type === 'group'
                    ? 'Say hello, or share a task from its detail view so your team can claim it.'
                    : `Say hello to ${title}.`}
                </Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={keyExtractor}
                contentContainerStyle={listContentStyle}
                onContentSizeChange={handleContentSizeChange}
                onScroll={handleScroll}
                onScrollBeginDrag={handleScrollBeginDrag}
                scrollEventThrottle={64}
                // Older pages are prepended above what you're reading; this
                // keeps your place instead of jumping.
                maintainVisibleContentPosition={MAINTAIN_POSITION}
                renderItem={renderItem}
                ListFooterComponent={
                  <TypingBubble
                    hub={hub}
                    conversation={conversation}
                    currentUserId={currentUserId}
                    membersById={membersById}
                    onShow={followTyping}
                  />
                }
              />
            )}
          </GlassTarget>

          {/* Messages fade out before they reach the back button and the gaps
              around the title, instead of showing through between them. */}
          <LinearGradient
            pointerEvents="none"
            colors={[colors.bg, colors.bg, 'rgba(250,249,247,0)']}
            locations={[0, 0.6, 1]}
            style={[styles.topFade, { height: headerHeight + 18 }]}
          />

          <View
            pointerEvents="box-none"
            style={[styles.header, { paddingTop: Math.max(insets.top, 40) + 6 }]}
            onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
          >
            <GlassButton label="Back to chats" onPress={onBack}>
              <Icon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2} />
            </GlassButton>
            {/* Heavier wash than the tab bar: this glass sits over text. */}
            <Glass radius={26} wash={0.74} style={styles.titleCapsule}>
              <View style={[styles.titleInner, headerFaces.length === 0 && styles.titleInnerBare]}>
                {conversation.type === 'dm' && headerFaces[0] ? (
                  <View>
                    <Avatar {...headerFaces[0]} size={36} borderColor={colors.surface} />
                    {otherOnline ? <View style={styles.headerOnlineDot} /> : null}
                  </View>
                ) : headerFaces.length > 0 ? (
                  <View style={styles.headerFaces}>
                    {headerFaces.map((m, i) => (
                      <Avatar key={m.id} {...m} size={34} borderColor={colors.surface} style={i > 0 ? styles.headerFaceOverlap : undefined} />
                    ))}
                  </View>
                ) : null}
                <View style={styles.titleText}>
                  <Text style={[styles.ink, styles.headerTitle]} numberOfLines={1}>
                    {title}
                  </Text>
                  <HeaderStatus
                    hub={hub}
                    conversation={conversation}
                    currentUserId={currentUserId}
                    membersById={membersById}
                    memberCount={members.length}
                    hereNow={hereNow}
                    otherOnline={otherOnline}
                  />
                </View>
              </View>
            </Glass>
          </View>

          <LinearGradient
            pointerEvents="none"
            colors={['rgba(250,249,247,0)', colors.bg, colors.bg]}
            locations={[0, 0.35, 1]}
            style={[styles.bottomFade, { height: composerHeight + 18 }]}
          />

          <View
            pointerEvents="box-none"
            style={[styles.bottomDock, { paddingBottom: keyboardUp ? 10 : Math.max(insets.bottom, 12) + 6 }]}
            onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)}
          >
            {attachError ? (
              <View style={styles.attachErrorBox}>
                <Icon name="exclamation" size={14} color={colors.redText} strokeWidth={2.2} />
                <Text style={[type.caption, styles.errorText]} numberOfLines={2}>
                  {attachError}
                </Text>
              </View>
            ) : null}
            {deleteError ? (
              <View style={styles.attachErrorBox}>
                <Icon name="exclamation" size={14} color={colors.redText} strokeWidth={2.2} />
                <Text style={[type.caption, styles.errorText]} numberOfLines={2}>
                  {deleteError}
                </Text>
              </View>
            ) : null}

            <View style={styles.composer}>
              {attachOpen ? (
                // Solid ink while the menu is open: the + turned ×, so it reads as "close".
                <Pressable
                  onPress={() => setAttachOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close attach menu"
                  hitSlop={4}
                  style={({ pressed }) => [styles.attachClose, pressed && styles.pressedLift]}
                >
                  <Icon name="close" size={20} color={colors.onInk} strokeWidth={2.2} />
                </Pressable>
              ) : (
                <GlassButton label="Attach" onPress={() => !attaching && setAttachOpen(true)} size={COMPOSER_H}>
                  {attaching ? (
                    <ActivityIndicator size="small" color={colors.purple} />
                  ) : (
                    <Icon name="plus" size={22} color={colors.ink} strokeWidth={1.9} />
                  )}
                </GlassButton>
              )}
              <Glass radius={COMPOSER_H / 2} style={styles.inputCapsule}>
                <View style={styles.inputRow}>
                  <TextInput
                    value={input}
                    onChangeText={handleInputChange}
                    placeholder="Message"
                    placeholderTextColor={colors.faint}
                    multiline
                    numberOfLines={1}
                    style={styles.input}
                  />
                  <Pressable
                    onPress={handleSend}
                    disabled={!canSend}
                    accessibilityRole="button"
                    accessibilityLabel="Send"
                    accessibilityState={{ disabled: !canSend }}
                    style={({ pressed }) => [styles.sendButton, canSend && styles.sendButtonOn, pressed && canSend && styles.sendButtonPressed]}
                  >
                    {canSend ? (
                      <LinearGradient colors={gradients.purpleDeep} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.sendFill}>
                        <Icon name="arrowUp" size={18} color={colors.onInk} strokeWidth={2} />
                      </LinearGradient>
                    ) : (
                      // Quiet lilac until there's something to send.
                      <View style={[styles.sendFill, styles.sendFillOff]}>
                        <Icon name="arrowUp" size={18} color={SEND_OFF_ICON} strokeWidth={2} />
                      </View>
                    )}
                  </Pressable>
                </View>
              </Glass>
            </View>
          </View>

          {attachOpen ? (
            <>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setAttachOpen(false)} accessibilityLabel="Close attach menu" />
              {/* Opens above the + (now ×). A sibling of the dock, not inside
                  it, so Android still delivers taps above the dock's bounds. */}
              <View style={[styles.attachMenu, { bottom: composerHeight - 8 + 14 }]}>
                {ATTACH_KINDS.map((kind) => (
                  <Pressable
                    key={kind.label}
                    onPress={() => {
                      setAttachOpen(false);
                      handleAttach(kind.source);
                    }}
                    disabled={attaching}
                    accessibilityRole="button"
                    accessibilityLabel={`Attach ${kind.label.toLowerCase()}`}
                    style={({ pressed }) => [styles.attachItem, pressed && styles.pressedLift]}
                  >
                    <View style={styles.attachTile}>
                      <Icon name={kind.icon} size={22} color={colors.purple} strokeWidth={1.8} />
                    </View>
                    <Text style={[styles.attachLabel, styles.ink]}>{kind.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </GlassScene>
      </KeyboardAvoider>

      <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} onClaimed={handleClaimed} />
      <TaskClaimedModal task={claimedTask} onClose={() => setClaimedTask(null)} onView={setOpenTaskId} />
      <HoldMenu
        anchor={anchor}
        mine={heldMine}
        topLimit={Math.max(insets.top, 40) + 8}
        bottomLimit={Math.max(insets.bottom, 12) + 12}
        onClose={() => setAnchor(null)}
        onPick={(emoji) => {
          if (anchor) toggleReaction(anchor.messageId, emoji);
          setAnchor(null);
        }}
        onDeletePress={() => {
          if (anchor) setDeletingId(anchor.messageId);
          setAnchor(null);
        }}
      />
      <ConfirmDialog
        visible={deletingId !== null}
        title="Unsend this message?"
        message="It's removed for everyone in this chat. This can't be undone."
        confirmLabel="Unsend"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
      />
    </>
  );
}

/** The quiet grey pill behind small labels (effort, dates, low priority). */
const GREY_PILL = 'rgba(21,21,26,0.05)';

/**
 * Who is typing in this thread right now, or null. In the group, anyone
 * typing to the group; in a DM, only the other person typing to you.
 * Typing clears after 3s of silence ("stopped typing" isn't its own event)
 * or as soon as that person's message lands. Each caller keeps its own
 * copy, so a typing event re-renders only the header line and the bubble,
 * not the whole screen and its message list.
 */
function useTypingUser(hub: ChatHub | null, conversation: Conversation, currentUserId: string | undefined) {
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const convKey = conversationKey(conversation);

  useEffect(() => {
    setTypingUserId(null);
    if (!hub || !currentUserId) return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = hub.listen((event) => {
      const current = conversationRef.current;
      if (event.type === 'typing') {
        const { userId, recipientId } = event.typing;
        const relevant =
          current.type === 'group'
            ? recipientId === null
            : recipientId === currentUserId && userId === current.otherUserId;
        if (!relevant) return;
        setTypingUserId(userId);
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => setTypingUserId(null), 3000);
      } else if (event.type === 'message') {
        const { message } = event;
        if (!belongsToConversation(message, currentUserId, current)) return;
        setTypingUserId((prev) => (prev === message.authorId ? null : prev));
      }
    });
    return () => {
      unsubscribe();
      if (timeout) clearTimeout(timeout);
    };
  }, [hub, currentUserId, convKey]);

  return typingUserId;
}

/** The capsule's second line: who's here, or who's typing. Mint only when someone is actually here. */
function HeaderStatus({
  hub,
  conversation,
  currentUserId,
  membersById,
  memberCount,
  hereNow,
  otherOnline,
}: {
  hub: ChatHub | null;
  conversation: Conversation;
  currentUserId: string | undefined;
  membersById: Record<string, Member>;
  memberCount: number;
  hereNow: number;
  otherOnline: boolean;
}) {
  const typingUserId = useTypingUser(hub, conversation, currentUserId);
  const typingName = typingUserId ? firstName(membersById[typingUserId]?.name ?? 'Someone') : null;

  let subtitle: string;
  let live: boolean;
  if (typingName) {
    subtitle = conversation.type === 'group' ? `${typingName} is typing…` : 'Typing…';
    live = true;
  } else if (conversation.type === 'group') {
    live = hereNow > 0;
    subtitle = live ? `${hereNow} here now` : `${memberCount} ${memberCount === 1 ? 'member' : 'members'}`;
  } else {
    live = otherOnline;
    subtitle = otherOnline ? 'Active now' : 'Offline';
  }

  return (
    <View style={styles.headerSubRow}>
      {live ? <View style={styles.liveDot} /> : null}
      <Text style={[styles.headerSub, live ? styles.liveText : styles.muted]} numberOfLines={1}>
        {subtitle}
      </Text>
    </View>
  );
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/** Three dots pulsing in a stagger, inside the typing bubble. */
function TypingDots() {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0.45))).current;

  useEffect(() => {
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.45, duration: 300, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [values]);

  return (
    <View style={styles.typingDots}>
      {values.map((v, i) => (
        <Animated.View key={i} style={[styles.typingDot, { opacity: v }]} />
      ))}
    </View>
  );
}

/** A bubble of dots at the bottom of the thread, from whoever is typing, so it reads as a reply on its way. */
function TypingBubble({
  hub,
  conversation,
  currentUserId,
  membersById,
  onShow,
}: {
  hub: ChatHub | null;
  conversation: Conversation;
  currentUserId: string | undefined;
  membersById: Record<string, Member>;
  onShow: () => void;
}) {
  const typingUserId = useTypingUser(hub, conversation, currentUserId);
  const typer = typingUserId ? membersById[typingUserId] : undefined;

  useEffect(() => {
    if (typingUserId) onShow();
  }, [typingUserId, onShow]);

  if (!typingUserId) return null;
  return (
    <View style={[styles.line, styles.typingLine]} accessibilityLabel={`${typer?.name ?? 'Someone'} is typing`}>
      {typer ? <Avatar {...typer} size={AVATAR} /> : <View style={styles.avatarSpacer} />}
      <View style={[styles.bubbleOther, styles.typingBubble, bubbleCorners(false, true)]}>
        <TypingDots />
      </View>
    </View>
  );
}

const PRIORITY: Record<Priority, { label: string; text: string; bg: string }> = {
  high: { label: 'High', text: colors.redText, bg: colors.redSoft },
  medium: { label: 'Medium', text: colors.yellowText, bg: colors.yellowSoft },
  low: { label: 'Low', text: colors.muted, bg: GREY_PILL },
};

/** Fades and lifts a newly-arrived message into place. Existing history renders at rest, so scrolling never re-animates it. */
function MessageEntry({ animate, onSettled, children }: { animate: boolean; onSettled: () => void; children: ReactNode }) {
  const progress = useRef(new Animated.Value(animate ? 0 : 1)).current;

  useEffect(() => {
    if (!animate) return;
    Animated.timing(progress, { toValue: 1, duration: 240, useNativeDriver: true }).start(onSettled);
    // Mount-only on purpose: this animates a message's arrival, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A stack of bubbles from one person reads as one block: the first bubble
 * keeps its round top, the tail corner (on the speaker's side, at the
 * bottom) stays tight, and every bubble after the first is tight on the
 * speaker's side all the way down.
 */
function bubbleCorners(isOwn: boolean, first: boolean) {
  if (isOwn) {
    return first
      ? { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 6, borderBottomLeftRadius: 20 }
      : { borderTopLeftRadius: 20, borderTopRightRadius: 6, borderBottomRightRadius: 6, borderBottomLeftRadius: 20 };
  }
  return first
    ? { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6 }
    : { borderTopLeftRadius: 6, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6 };
}

/** One message's text bubble: white for others, the purple gradient for yours. Shared by the list and the hold menu's lifted copy. */
function TextBubble({ body, isOwn, first, lifted }: { body: string; isOwn: boolean; first: boolean; lifted?: boolean }) {
  const corners = bubbleCorners(isOwn, first);
  if (isOwn) {
    return (
      <LinearGradient
        colors={OWN_BUBBLE}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.bubble, styles.bubbleOwn, corners, lifted && styles.bubbleOwnLifted]}
      >
        <Text style={[styles.bubbleText, styles.onInk]}>{body}</Text>
      </LinearGradient>
    );
  }
  return (
    <View style={[styles.bubble, styles.bubbleOther, corners, lifted && styles.bubbleOtherLifted]}>
      <Text style={[styles.bubbleText, styles.ink]}>{body}</Text>
    </View>
  );
}

/** Memoized: with stable callbacks from ChatScreen, a new message or reaction re-renders only the rows it touches. */
const MessageRow = memo(function MessageRow({
  message,
  isOwn,
  author,
  first,
  last,
  spacing,
  sharedTask,
  membersById,
  onClaim,
  onOpen,
  onClaimed,
  reactions,
  currentUserId,
  onToggleReaction,
  onAnchor,
  isNew,
  onSettled,
}: {
  message: Message;
  isOwn: boolean;
  author: Member | undefined;
  /** Opens a stack: shows the name line (others) and the round top corners. */
  first: boolean;
  /** Closes a stack: shows the face (others) or the time (yours). */
  last: boolean;
  /** Space above this row: wider between stacks than inside one. */
  spacing: number;
  /** Only meaningful when message.sharedTaskId is set: the live task, or null if it's since been deleted. */
  sharedTask: Task | null;
  membersById: Record<string, Member>;
  onClaim: (taskId: string) => Promise<{ error: string | null }>;
  onOpen: (taskId: string) => void;
  onClaimed: (task: Task) => void;
  reactions: Reaction[];
  currentUserId: string | undefined;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onAnchor: (anchor: PickerAnchor) => void;
  isNew: boolean;
  onSettled: (messageId: string) => void;
}) {
  const time = formatTime(new Date(message.createdAt));
  const name = author?.name ? firstName(author.name) : 'Someone';
  const isTask = message.sharedTaskId !== null;
  const isFile = !isTask && message.attachmentPath !== null;
  const bubbleRef = useRef<View>(null);

  // Measured at press time rather than on layout: the list scrolls, so a
  // cached position would put the menu over the wrong message.
  function handleLongPress() {
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      onAnchor({ messageId: message.id, x, y, width, height, isOwn, body: isTask || isFile ? null : message.body, first });
    });
  }

  const content = isTask ? (
    <TaskShareCard
      task={sharedTask}
      isOwn={isOwn}
      membersById={membersById}
      onClaim={onClaim}
      onOpen={onOpen}
      onClaimed={onClaimed}
      onLongPress={handleLongPress}
    />
  ) : isFile ? (
    <AttachmentCard message={message} isOwn={isOwn} first={first} onLongPress={handleLongPress} />
  ) : (
    <Pressable onLongPress={handleLongPress} delayLongPress={300} style={({ pressed }) => pressed && styles.bubblePressed}>
      <TextBubble body={message.body ?? ""} isOwn={isOwn} first={first} />
    </Pressable>
  );

  return (
    <MessageEntry animate={isNew} onSettled={() => onSettled(message.id)}>
      <View style={{ marginTop: spacing }}>
        {first && !isOwn ? (
          <View style={styles.who}>
            <Text style={[styles.whoName, styles.muted]} numberOfLines={1}>
              {isTask ? `${name} shared a task` : name}
            </Text>
            <Text style={[styles.whoTime, styles.faint]}>{time}</Text>
          </View>
        ) : null}
        <View style={[styles.line, isOwn && styles.lineOwn]}>
          {isOwn ? null : last && author ? <Avatar {...author} size={AVATAR} /> : <View style={styles.avatarSpacer} />}
          <View style={[styles.bubbleWrap, reactions.length > 0 && styles.bubbleWrapReacted]}>
            <View ref={bubbleRef} collapsable={false}>
              {content}
            </View>
            {reactions.length > 0 ? (
              <ReactionPills
                reactions={reactions}
                currentUserId={currentUserId}
                onToggle={(emoji) => onToggleReaction(message.id, emoji)}
                isOwn={isOwn}
              />
            ) : null}
          </View>
        </View>
        {isOwn && last ? <Text style={[styles.ownTime, styles.faint]}>{time}</Text> : null}
      </View>
    </MessageEntry>
  );
});

/** Reactions sit on the bubble's bottom edge, on the side away from the tail. */
function ReactionPills({
  reactions,
  currentUserId,
  onToggle,
  isOwn,
}: {
  reactions: Reaction[];
  currentUserId: string | undefined;
  onToggle: (emoji: string) => void;
  isOwn: boolean;
}) {
  const pop = useRef(new Animated.Value(0)).current;
  const grouped = new Map<string, number>();
  const mine = new Set<string>();
  for (const r of reactions) {
    grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1);
    if (r.userId === currentUserId) mine.add(r.emoji);
  }

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 160 }).start();
    // Mount-only: the pop belongs to the first reaction landing, not to every count change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        styles.reactionRow,
        isOwn ? styles.reactionRowOwn : styles.reactionRowOther,
        { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
      ]}
    >
      {Array.from(grouped.entries()).map(([emoji, count]) => {
        const isMine = mine.has(emoji);
        return (
          <Pressable
            key={emoji}
            onPress={() => onToggle(emoji)}
            hitSlop={6}
            style={({ pressed }) => [styles.reactionPill, isMine && styles.reactionPillMine, pressed && styles.pressedLift]}
            accessibilityRole="button"
            accessibilityLabel={`${emoji} reaction, ${count}${isMine ? ', you reacted' : ''}`}
          >
            <Text style={[styles.reactionText, isMine ? styles.reactionTextMine : styles.muted]}>
              {emoji} {count}
            </Text>
          </Pressable>
        );
      })}
    </Animated.View>
  );
}

/** Bubble face size beside incoming messages. */
const AVATAR = 28;
/** The composer's + button, input capsule and header capsule height. */
const COMPOSER_H = 52;
const SEND_OFF_ICON = '#A996F2';
const OWN_BUBBLE = ['#7C5FF2', '#6342E2'] as const;

const HOLD_BAR_H = 56;
const HOLD_ITEM = 44;
const HOLD_GAP = 10;
const HOLD_CARD_H = 50;
const HOLD_BAR_W = REACTION_PALETTE.length * HOLD_ITEM + (REACTION_PALETTE.length - 1) * 2 + 12;

/**
 * Press and hold a message: the chat dims, the message lifts out, the
 * emoji bar opens above it and — on your own message only — an Unsend
 * card below it. Only the author can unsend. The group is nudged up or
 * down to stay on screen; tasks and files stay in place under the dim.
 */
function HoldMenu({
  anchor,
  mine,
  topLimit,
  bottomLimit,
  onClose,
  onPick,
  onDeletePress,
}: {
  anchor: PickerAnchor | null;
  /** Emoji you've already reacted with on this message. */
  mine: Set<string>;
  /** Lowest y the menu may occupy: below the status bar. */
  topLimit: number;
  /** Space to keep clear at the bottom of the screen. */
  bottomLimit: number;
  onClose: () => void;
  onPick: (emoji: string) => void;
  onDeletePress: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const itemScales = useRef(REACTION_PALETTE.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!anchor) {
      progress.setValue(0);
      itemScales.forEach((v) => v.setValue(0));
      return;
    }
    Animated.parallel([
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, friction: 7, tension: 140 }),
      Animated.stagger(
        28,
        itemScales.map((v) => Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 6, tension: 180 }))
      ),
    ]).start();
  }, [anchor, progress, itemScales]);

  if (!anchor) return <Modal visible={false} transparent />;

  const screen = Dimensions.get('window');
  const above = HOLD_BAR_H + HOLD_GAP;
  const below = anchor.isOwn ? HOLD_GAP + HOLD_CARD_H : 0;
  let top = anchor.y - above;
  const maxBottom = screen.height - bottomLimit;
  if (top + above + anchor.height + below > maxBottom) top = maxBottom - (above + anchor.height + below);
  if (top < topLimit) top = topLimit;
  const side = anchor.isOwn
    ? { right: Math.max(screen.width - (anchor.x + anchor.width), 8), alignItems: 'flex-end' as const }
    : { left: Math.min(Math.max(anchor.x, 8), Math.max(screen.width - HOLD_BAR_W - 8, 8)), alignItems: 'flex-start' as const };

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close message options">
        <Animated.View style={[styles.scrim, { opacity: progress }]} />
      </Pressable>
      <Animated.View
        pointerEvents="box-none"
        style={[
          styles.holdGroup,
          side,
          {
            top,
            // The bar and card are shadowed, so Android can't fade them
            // without the shadow showing through: they only pop there.
            opacity: canFadeShadowed ? progress : 1,
            transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          },
        ]}
      >
        <View style={styles.holdBar} accessibilityRole="toolbar" accessibilityLabel="React">
          {REACTION_PALETTE.map((emoji, i) => (
            <Animated.View key={emoji} style={{ transform: [{ scale: itemScales[i] }] }}>
              <Pressable
                onPress={() => onPick(emoji)}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
                accessibilityState={{ selected: mine.has(emoji) }}
                style={({ pressed }) => [styles.holdItem, (mine.has(emoji) || pressed) && styles.holdItemOn]}
              >
                <Text style={styles.holdEmoji}>{emoji}</Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        {anchor.body !== null ? (
          <View style={[styles.holdCopy, { width: anchor.width, transformOrigin: anchor.isOwn ? 'right center' : 'left center' }]}>
            <TextBubble body={anchor.body} isOwn={anchor.isOwn} first={anchor.first} lifted />
          </View>
        ) : (
          <View pointerEvents="none" style={{ width: anchor.width, height: anchor.height }} />
        )}

        {anchor.isOwn ? (
          <View style={styles.holdCard}>
            <Pressable
              onPress={onDeletePress}
              accessibilityRole="button"
              accessibilityLabel="Unsend this message"
              style={({ pressed }) => [styles.holdAction, pressed && styles.holdActionPressed]}
            >
              <Text style={styles.holdActionText}>Unsend</Text>
              <Icon name="trash" size={18} color={colors.redText} strokeWidth={1.9} />
            </Pressable>
          </View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

/** A task shared into the chat: what it is, how big, and one tap to take it. */
function TaskShareCard({
  task,
  isOwn,
  membersById,
  onClaim,
  onOpen,
  onClaimed,
  onLongPress,
}: {
  task: Task | null;
  isOwn: boolean;
  membersById: Record<string, Member>;
  onClaim: (taskId: string) => Promise<{ error: string | null }>;
  onOpen: (taskId: string) => void;
  onClaimed: (task: Task) => void;
  onLongPress: () => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shape = isOwn ? styles.taskCardOwn : styles.taskCardOther;

  if (!task) {
    return (
      <Pressable onLongPress={onLongPress} delayLongPress={300} style={[styles.bubbleOther, styles.taskCard, shape]}>
        <Text style={[styles.taskMeta, styles.muted]}>This task was deleted.</Text>
      </Pressable>
    );
  }

  async function handleClaim() {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    const result = await onClaim(task!.id);
    setClaiming(false);
    if (result.error) {
      setError(result.error);
    } else {
      onClaimed(task!);
    }
  }

  const assignee = task.assigneeId ? membersById[task.assigneeId] : null;
  const priority = PRIORITY[task.priority];

  return (
    <Pressable
      onPress={() => onOpen(task!.id)}
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={`Open ${task.title}`}
      style={({ pressed }) => [styles.bubbleOther, styles.taskCard, shape, pressed && styles.bubblePressed]}
    >
      <View style={styles.taskTop}>
        <View style={styles.taskCheck}>
          <TaskStatusDot status={task.status} size={20} />
        </View>
        <View style={styles.taskBody}>
          <Text style={[styles.taskTitle, styles.ink]} numberOfLines={2}>
            {task.title}
          </Text>
          <View style={styles.taskPills}>
            <View style={[styles.pill, { backgroundColor: priority.bg }]}>
              <Text style={[styles.pillText, { color: priority.text }]}>{priority.label}</Text>
            </View>
            {task.effortHours ? (
              <View style={[styles.pill, styles.pillGrey]}>
                <Text style={[styles.pillText, styles.muted]}>{Number(task.effortHours.toFixed(1))}h</Text>
              </View>
            ) : null}
            {task.dueLabel ? (
              <View style={[styles.pill, task.dueUrgent ? styles.pillCoral : styles.pillGrey]}>
                <Text style={[styles.pillText, task.dueUrgent ? styles.dueUrgent : styles.muted]}>{task.dueLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {task.assigneeId === null ? (
        <Pressable
          onPress={handleClaim}
          disabled={claiming}
          style={({ pressed }) => [styles.claimButton, pressed && styles.pressedLift]}
          accessibilityRole="button"
          accessibilityLabel={`Claim ${task.title}`}
        >
          {claiming ? <ActivityIndicator size="small" color={colors.purple} /> : <Text style={styles.claimText}>Claim</Text>}
        </Pressable>
      ) : (
        <View style={styles.taskAssignee}>
          {assignee ? <Avatar {...assignee} size={22} /> : null}
          <Text style={[styles.taskMeta, styles.muted]} numberOfLines={1}>
            {assignee ? `Claimed by ${firstName(assignee.name)}` : 'Claimed'}
          </Text>
        </View>
      )}
      {error ? (
        <Text style={[type.caption, styles.errorText]} numberOfLines={2}>
          {error}
        </Text>
      ) : null}
    </Pressable>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Picks the closest icon for what was actually attached, from the message's own mime type. */
function attachmentIcon(mimeType: string | null): IconName {
  if (!mimeType) return 'document';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

/** A short, human name for the file's kind: "PDF", "Word", "Audio"… */
function attachmentKind(mimeType: string | null, name: string | null): string {
  const mime = mimeType ?? '';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('word')) return 'Word';
  if (mime.includes('sheet') || mime.includes('excel')) return 'Excel';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'PowerPoint';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime.startsWith('video/')) return 'Video';
  if (mime.startsWith('image/')) return 'Image';
  const ext = name?.includes('.') ? name.split('.').pop() : null;
  return ext ? ext.toUpperCase() : 'File';
}

/**
 * Images get their own path (ImageAttachmentCard below): a thumbnail in the
 * bubble and a real in-app viewer. Everything else — PDFs, docs, audio,
 * video — opens through the OS via Linking, which is the right tool for
 * those. Drawn as a bubble in the stack, with a tinted tile for its kind
 * (red for PDFs).
 */
function AttachmentCard({
  message,
  isOwn,
  first,
  onLongPress,
}: {
  message: Message;
  isOwn: boolean;
  first: boolean;
  onLongPress: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (message.attachmentType?.startsWith('image/')) {
    return <ImageAttachmentCard message={message} corners={bubbleCorners(isOwn, first)} onLongPress={onLongPress} />;
  }

  async function handleOpen() {
    if (opening || !message.attachmentPath) return;
    setOpening(true);
    setError(null);
    try {
      const url = await getAttachmentUrl(message.attachmentPath);
      await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this file.');
    }
    setOpening(false);
  }

  const isPdf = message.attachmentType === 'application/pdf';
  const tint = isPdf ? { bg: colors.redSoft, fg: colors.redText } : { bg: colors.purpleSoft, fg: colors.purple };
  const kind = attachmentKind(message.attachmentType, message.attachmentName);
  const meta = message.attachmentSize !== null ? `${kind} · ${formatFileSize(message.attachmentSize)}` : kind;

  return (
    <Pressable
      onPress={handleOpen}
      onLongPress={onLongPress}
      delayLongPress={300}
      disabled={opening}
      accessibilityRole="button"
      accessibilityLabel={`Open ${message.attachmentName}`}
      style={({ pressed }) => [styles.bubbleOther, styles.fileCard, bubbleCorners(isOwn, first), pressed && styles.bubblePressed]}
    >
      <View style={[styles.fileTile, { backgroundColor: tint.bg }]}>
        {opening ? (
          <ActivityIndicator size="small" color={tint.fg} />
        ) : (
          <Icon name={attachmentIcon(message.attachmentType)} size={20} color={tint.fg} strokeWidth={1.8} />
        )}
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, styles.ink]} numberOfLines={2}>
          {message.attachmentName}
        </Text>
        <Text style={[styles.fileMeta, styles.muted]}>{meta}</Text>
        {error ? (
          <Text style={[type.caption, styles.errorText]} numberOfLines={2}>
            {error}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * A real thumbnail in the bubble, tapped open to a full-screen viewer —
 * the resolution the "why is my photo a link" complaint was actually
 * asking for. The signed URL is resolved once, on mount, since the
 * thumbnail needs it to render at all rather than only on tap.
 */
function ImageAttachmentCard({
  message,
  corners,
  onLongPress,
}: {
  message: Message;
  corners: ReturnType<typeof bubbleCorners>;
  onLongPress: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!message.attachmentPath) return;
    getAttachmentUrl(message.attachmentPath)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this image.');
      });
    return () => {
      cancelled = true;
    };
  }, [message.attachmentPath]);

  return (
    <>
      <Pressable
        onPress={() => url && setViewerOpen(true)}
        onLongPress={onLongPress}
        delayLongPress={300}
        disabled={!url}
        accessibilityRole="button"
        accessibilityLabel={`Open ${message.attachmentName ?? 'image'}`}
        style={({ pressed }) => [styles.imageThumbWrap, corners, pressed && styles.bubblePressed]}
      >
        {url ? (
          <Image source={{ uri: url }} style={styles.imageThumb} resizeMode="cover" />
        ) : error ? (
          <View style={[styles.imageThumb, styles.imageThumbFallback]}>
            <Icon name="exclamation" size={18} color={colors.redText} strokeWidth={2} />
          </View>
        ) : (
          <View style={[styles.imageThumb, styles.imageThumbFallback]}>
            <ActivityIndicator color={colors.purple} />
          </View>
        )}
      </Pressable>

      <ImageViewerModal
        visible={viewerOpen}
        url={url}
        filename={message.attachmentName}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}

/** Full-screen image + a real Save, not a hand-off to the OS. Downloads the signed URL to a local file, then hands that local file to the OS share sheet — the standard Expo path to "save this to my phone" without asking for gallery permissions directly. */
function ImageViewerModal({
  visible,
  url,
  filename,
  onClose,
}: {
  visible: boolean;
  url: string | null;
  filename: string | null;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    if (saving || !url) return;
    setSaving(true);
    setSaveError(null);
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setSaveError('Saving files is not available on this device.');
        return;
      }
      const destinationName = filename ?? `image-${Date.now()}.jpg`;
      const downloaded = await File.downloadFileAsync(url, new Directory(Paths.cache), { idempotent: true });
      await Sharing.shareAsync(downloaded.uri, { dialogTitle: destinationName });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save this image.');
    }
    setSaving(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerBackdrop}>
        {url ? <Image source={{ uri: url }} style={styles.viewerImage} resizeMode="contain" /> : null}

        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.viewerClose}>
          <Icon name="close" size={18} color={colors.onInk} strokeWidth={2.2} />
        </Pressable>

        <View style={styles.viewerFooter}>
          {saveError ? <Text style={[type.caption, styles.viewerError]}>{saveError}</Text> : null}
          <Pressable onPress={handleSave} disabled={saving} accessibilityRole="button" style={styles.viewerSaveButton}>
            {saving ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <>
                <Icon name="download" size={16} color={colors.ink} strokeWidth={2} />
                <Text style={[type.button, styles.viewerSaveText]}>Save</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function TaskClaimedModal({
  task,
  onClose,
  onView,
}: {
  task: Task | null;
  onClose: () => void;
  onView: (taskId: string) => void;
}) {
  return (
    <Modal visible={task !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.claimedBackdrop} onPress={onClose}>
        <Pressable style={styles.claimedCard} onPress={(e) => e.stopPropagation()}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.claimedClose} hitSlop={8}>
            <Icon name="close" size={16} color={colors.muted} strokeWidth={2} />
          </Pressable>
          <View style={styles.claimedIconTile}>
            <Icon name="check" size={26} color={colors.onInk} strokeWidth={3} />
          </View>
          <Text style={[type.sectionHeading, styles.ink, styles.claimedTitle]}>Task claimed!</Text>
          {task ? (
            <Text style={[type.body, styles.muted, styles.claimedText]}>
              You've successfully claimed <Text style={styles.ink}>"{task.title}"</Text>
            </Text>
          ) : null}
          <Pressable
            onPress={() => {
              if (task) onView(task.id);
              onClose();
            }}
            accessibilityRole="button"
            style={styles.claimedViewButton}
          >
            <Text style={[type.button, styles.onInk]}>View task</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Floats over the messages: back button + a title capsule, no bar behind them.
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 8,
  },
  muted: {
    color: colors.muted,
  },
  ink: {
    color: colors.ink,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 40,
  },
  centerText: {
    textAlign: 'center',
  },
  retry: {
    marginTop: 4,
    height: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryPressed: {
    transform: [{ scale: 0.97 }],
  },
  retryText: {
    color: colors.purple,
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  bottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  emptyTile: {
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: layout.iconTileRadius,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  onInk: {
    color: colors.onInk,
  },
  errorText: {
    flex: 1,
    color: colors.redText,
  },
  attachErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: layout.screenPadding,
    marginBottom: 8,
    backgroundColor: colors.redSoft,
    borderRadius: 12,
    padding: 10,
  },
  // 220 wide to match attachmentCard, 4:3-ish so a portrait or landscape
  // photo both crop to something reasonable rather than a tall sliver.
  imageThumbWrap: {
    width: 220,
    height: 165,
    borderRadius: 16,
    overflow: 'hidden',
  },
  imageThumb: {
    width: '100%',
    height: '100%',
  },
  imageThumbFallback: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,9,15,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '78%',
  },
  viewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerFooter: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
    gap: 10,
  },
  viewerError: {
    color: colors.red,
  },
  viewerSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: colors.onInk,
  },
  viewerSaveText: {
    color: colors.ink,
  },
  // Everything below the messages: errors, attach chips, composer.
  bottomDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 8,
  },
  claimedBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,15,26,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.screenPadding,
  },
  claimedCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  claimedClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimedIconTile: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  claimedTitle: {
    textAlign: 'center',
  },
  claimedText: {
    textAlign: 'center',
    marginBottom: 10,
  },
  claimedViewButton: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedLift: {
    transform: [{ scale: 0.97 }],
  },
  faint: {
    color: colors.faint,
  },
  // Header capsule: faces, then the title over a presence line.
  titleCapsule: {
    flex: 1,
    height: COMPOSER_H,
  },
  titleInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 7,
    paddingRight: 16,
  },
  titleInnerBare: {
    paddingLeft: 16,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  headerFaces: {
    flexDirection: 'row',
  },
  headerFaceOverlap: {
    marginLeft: -10,
  },
  headerOnlineDot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  // Medium, not semibold: a bold name in a small capsule looked heavy on phones.
  headerTitle: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: -0.1,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerSub: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  liveText: {
    color: colors.mintText,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.green,
  },
  // Messages
  list: {
    paddingHorizontal: layout.screenPadding,
  },
  dayRow: {
    alignItems: 'center',
    marginTop: 22,
  },
  dayRowFirst: {
    marginTop: 0,
  },
  dayChip: {
    height: 26,
    paddingHorizontal: 12,
    borderRadius: 13,
    backgroundColor: GREY_PILL,
    justifyContent: 'center',
  },
  dayText: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: AVATAR + 10,
    marginBottom: 4,
  },
  whoName: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    flexShrink: 1,
  },
  whoTime: {
    fontFamily: type.caption.fontFamily,
    fontSize: 12,
    lineHeight: 16,
  },
  ownTime: {
    alignSelf: 'flex-end',
    fontFamily: type.caption.fontFamily,
    fontSize: 11,
    lineHeight: 14,
    marginTop: 3,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  lineOwn: {
    justifyContent: 'flex-end',
  },
  avatarSpacer: {
    width: AVATAR,
  },
  bubbleWrap: {
    flexShrink: 1,
  },
  // Room under the bubble for the reaction pills that sit on its edge.
  bubbleWrapReacted: {
    paddingBottom: 14,
  },
  bubble: {
    maxWidth: 262,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubblePressed: {
    transform: [{ scale: 0.98 }],
  },
  // No elevation on bubbles: rows fade in, and Android draws a grey box
  // under a fading elevated view. iOS and web get the soft shadow.
  bubbleOther: {
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: 'rgba(17,17,17,0.08)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  bubbleOtherLifted: {
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  bubbleOwn: {
    backgroundColor: '#6F51EA',
    shadowColor: '#5836D6',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bubbleOwnLifted: {
    shadowOpacity: 0.32,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  bubbleText: {
    fontFamily: type.caption.fontFamily,
    fontSize: 15,
    lineHeight: 21,
  },
  typingLine: {
    marginTop: 14,
  },
  typingBubble: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 5,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#A9A4B5',
  },
  // Reactions
  reactionRow: {
    position: 'absolute',
    bottom: 0,
    flexDirection: 'row',
    gap: 4,
  },
  reactionRowOther: {
    left: 12,
  },
  reactionRowOwn: {
    right: 12,
  },
  reactionPill: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: 'rgba(17,17,17,0.1)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  reactionPillMine: {
    backgroundColor: colors.purpleSoft,
    borderWidth: 1,
    borderColor: 'rgba(108,76,232,0.22)',
  },
  reactionText: {
    fontFamily: type.button.fontFamily,
    fontSize: 12,
    lineHeight: 16,
  },
  reactionTextMine: {
    color: colors.purple,
  },
  // Task card
  taskCard: {
    width: 270,
    padding: 14,
    gap: 12,
    borderRadius: 20,
  },
  taskCardOther: {
    borderTopLeftRadius: 6,
  },
  taskCardOwn: {
    borderTopRightRadius: 6,
  },
  taskTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  taskCheck: {
    marginTop: 1,
  },
  taskBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  taskTitle: {
    fontFamily: type.button.fontFamily,
    fontSize: 15,
    lineHeight: 21,
  },
  taskPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    justifyContent: 'center',
  },
  pillGrey: {
    backgroundColor: GREY_PILL,
  },
  pillCoral: {
    backgroundColor: colors.redSoft,
  },
  pillText: {
    fontFamily: type.button.fontFamily,
    fontSize: 12,
    lineHeight: 16,
  },
  dueUrgent: {
    color: colors.redText,
  },
  claimButton: {
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimText: {
    fontFamily: type.button.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.purple,
  },
  taskAssignee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskMeta: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1,
  },
  // File card
  fileCard: {
    maxWidth: 262,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 10,
    paddingRight: 14,
  },
  fileTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flexShrink: 1,
    minWidth: 0,
    gap: 1,
  },
  fileName: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  },
  fileMeta: {
    fontFamily: type.caption.fontFamily,
    fontSize: 12,
    lineHeight: 16,
  },
  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: layout.screenPadding,
  },
  attachClose: {
    width: COMPOSER_H,
    height: COMPOSER_H,
    borderRadius: COMPOSER_H / 2,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  inputCapsule: {
    flex: 1,
    minHeight: COMPOSER_H,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 18,
    paddingRight: 6,
  },
  // No box of its own: the glass capsule around it is the field.
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 0,
    paddingTop: 9,
    paddingBottom: 10,
    color: colors.ink,
    fontFamily: type.metadata.fontFamily,
    fontSize: 15,
    lineHeight: 21,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  sendButtonOn: {
    shadowColor: '#5836D6',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  sendButtonPressed: {
    transform: [{ scale: 0.92 }],
  },
  sendFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendFillOff: {
    backgroundColor: colors.purpleSoft,
  },
  attachMenu: {
    position: 'absolute',
    left: layout.screenPadding,
    width: 300,
    paddingVertical: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: 'rgba(17,17,17,0.06)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  attachItem: {
    width: 64,
    alignItems: 'center',
    gap: 6,
  },
  attachTile: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachLabel: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
  },
  // Hold menu
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(21,21,26,0.28)',
  },
  holdGroup: {
    position: 'absolute',
    gap: HOLD_GAP,
  },
  holdBar: {
    height: HOLD_BAR_H,
    paddingHorizontal: 6,
    borderRadius: HOLD_BAR_H / 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: 'rgba(17,17,17,0.06)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  holdItem: {
    width: HOLD_ITEM,
    height: HOLD_ITEM,
    borderRadius: HOLD_ITEM / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdItemOn: {
    backgroundColor: colors.purpleSoft,
  },
  holdEmoji: {
    fontSize: 24,
    lineHeight: 30,
  },
  holdCopy: {
    alignItems: 'stretch',
    transform: [{ scale: 1.03 }],
  },
  holdCard: {
    width: 200,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 0.5,
    borderColor: 'rgba(17,17,17,0.06)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  holdAction: {
    height: HOLD_CARD_H,
    borderRadius: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  holdActionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  holdActionText: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.redText,
  },
});

import { memo, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
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
import { useChatHub } from '../state/chatUnread';
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
export function ChatScreen({ conversation, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { project, tasks, members, membersById, claimTask, onlineUserIds } = useProject();
  const { session, profile } = useAuth();
  const hub = useChatHub();
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

  /** Reactions for just these messages, replacing what's held for them. A failure only means no pills until the next refresh — never an error screen. */
  const loadReactions = useCallback(
    async (messageIds: string[], thread: { cacheKey: string }) => {
      if (messageIds.length === 0) return;
      try {
        const fetched = await fetchReactions(messageIds);
        if (threadRef.current !== thread) return;
        const ids = new Set(messageIds);
        const loaded = new Set((messagesRef.current ?? []).map((m) => m.id));
        commit({
          reactions: [...reactionsRef.current.filter((r) => !ids.has(r.messageId) && loaded.has(r.messageId)), ...fetched],
        });
      } catch {
        // Non-fatal on purpose.
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
          if (reactionsRef.current.some((r) => sameReaction(r, reaction))) return;
          commit({ reactions: [...reactionsRef.current, reaction] });
          break;
        }
        case 'reactionRemoved': {
          const { reaction } = event;
          if (!reactionsRef.current.some((r) => sameReaction(r, reaction))) return;
          commit({ reactions: reactionsRef.current.filter((r) => !sameReaction(r, reaction)) });
          break;
        }
        case 'resync':
          if (event.conversationKey === null || event.conversationKey === convKey) void refreshLatest();
          break;
      }
    });
  }, [hub, currentUserId, convKey, addMessage, removeMessage, commit, refreshLatest]);

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
    // Optimistic, same as removeTask — the RLS delete is scoped to your
    // own messages, so this only fails on something like a dropped
    // connection, not a permissions surprise.
    removeMessage(messageId);
    try {
      await deleteMessage(messageId);
    } catch (err) {
      if (removed) addMessage(removed);
      setDeleteError(err instanceof Error ? err.message : 'Could not unsend this message.');
    }
  }

  const title = conversation.type === 'group' ? project.name : (membersById[conversation.otherUserId]?.name ?? 'Direct message');
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
    try {
      const sent = await sendMessage(project.id, currentUserId, body, conversation.type === 'dm' ? conversation.otherUserId : null);
      // Shown now from the inserted row; the Realtime echo is deduped by id.
      addMessage(sent);
      notifyOthers(body);
    } catch {
      setInput(body);
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
      const showHeader = !prevItem || prevItem.authorId !== item.authorId;
      const sharedTask = item.sharedTaskId ? (tasksById.get(item.sharedTaskId) ?? null) : null;
      return (
        <MessageRow
          message={item}
          isOwn={item.authorId === currentUserId}
          author={membersById[item.authorId]}
          showHeader={showHeader}
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

  const listContentStyle = useMemo(
    () => [styles.list, { paddingTop: headerHeight + 8, paddingBottom: composerHeight + 12 }],
    [headerHeight, composerHeight]
  );

  const canSend = input.trim().length > 0 && !sending;

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
              />
            )}
          </GlassTarget>

          <View
            pointerEvents="box-none"
            style={[styles.header, { paddingTop: Math.max(insets.top, 40) + 6 }]}
            onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
          >
            <GlassButton label="Back to chats" onPress={onBack}>
              <Icon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2} />
            </GlassButton>
            {/* Heavier wash than the tab bar: this glass sits over text. */}
            <Glass radius={24} wash={0.74} style={styles.titleCapsule}>
              <View style={styles.titleInner}>
                <Text style={[type.projectTitle, styles.ink]} numberOfLines={1}>
                  {title}
                </Text>
                <HeaderStatus
                  hub={hub}
                  conversation={conversation}
                  currentUserId={currentUserId}
                  membersById={membersById}
                  memberCount={members.length}
                  otherOnline={otherOnline}
                />
              </View>
            </Glass>
          </View>

          <View
            pointerEvents="box-none"
            style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 12) + 6 }]}
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

            {attachOpen || attaching ? (
              <View style={styles.attachRow}>
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
                    style={({ pressed }) => [styles.attachChip, (pressed || attaching) && styles.attachChipPressed]}
                  >
                    <Icon name={kind.icon} size={14} color={colors.muted} strokeWidth={1.8} />
                    <Text style={[type.tinyLabel, styles.muted]}>{kind.label}</Text>
                  </Pressable>
                ))}
                {attaching ? <ActivityIndicator size="small" color={colors.muted} /> : null}
              </View>
            ) : null}

            <View style={styles.composer}>
              <GlassButton
                label={attachOpen ? 'Hide attachments' : 'Attach'}
                onPress={() => setAttachOpen((v) => !v)}
                size={SEND_SIZE + 2}
                style={styles.attachButton}
              >
                <Icon name={attachOpen ? 'close' : 'plus'} size={20} color={colors.ink} strokeWidth={2} />
              </GlassButton>
              <Glass radius={SEND_SIZE / 2 + 4} style={styles.inputCapsule}>
                <View style={styles.inputRow}>
                  <TextInput
                    value={input}
                    onChangeText={handleInputChange}
                    placeholder={conversation.type === 'group' ? 'Message' : `Message ${title}`}
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
                    style={({ pressed }) => [styles.sendButton, pressed && canSend && styles.sendButtonPressed]}
                  >
                    {canSend ? (
                      <LinearGradient
                        colors={gradients.purpleDeep}
                        start={{ x: 0.25, y: 0 }}
                        end={{ x: 0.75, y: 1 }}
                        style={styles.sendFill}
                      >
                        <Icon name="send" size={17} color={colors.onInk} strokeWidth={1.9} />
                      </LinearGradient>
                    ) : (
                      // A flat neutral circle, not the gradient at 0.4 opacity: faded
                      // purple read as a half-painted blob rather than a disabled button.
                      <View style={[styles.sendFill, styles.sendFillDisabled]}>
                        <Icon name="send" size={17} color={colors.faint} strokeWidth={1.9} />
                      </View>
                    )}
                  </Pressable>
                </View>
              </Glass>
            </View>
          </View>
        </GlassScene>
      </KeyboardAvoider>

      <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} onClaimed={handleClaimed} />
      <TaskClaimedModal task={claimedTask} onClose={() => setClaimedTask(null)} onView={setOpenTaskId} />
      <ReactionPicker
        anchor={anchor}
        topLimit={Math.max(insets.top, 40) + 8}
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

/**
 * The header's dot + subtitle line. Owns the "is typing" state itself, so
 * a typing event re-renders only this line — not the whole screen and its
 * message list.
 *
 * Who counts: in the group, anyone typing to the group; in a DM, only the
 * other person typing to you. Typing clears after 3s of silence ("stopped
 * typing" isn't its own event) or as soon as that person's message lands.
 */
function HeaderStatus({
  hub,
  conversation,
  currentUserId,
  membersById,
  memberCount,
  otherOnline,
}: {
  hub: ChatHub | null;
  conversation: Conversation;
  currentUserId: string | undefined;
  membersById: Record<string, Member>;
  memberCount: number;
  otherOnline: boolean;
}) {
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

  const typingName = typingUserId ? (membersById[typingUserId]?.name ?? 'Someone') : null;
  const subtitle =
    typingName
      ? conversation.type === 'group'
        ? `${typingName} is typing`
        : 'Typing'
      : conversation.type === 'group'
        ? `${memberCount} ${memberCount === 1 ? 'person' : 'people'} in chat`
        : otherOnline
          ? 'Active now'
          : 'Offline';

  return (
    <View style={styles.headerSubRow}>
      <View style={[styles.liveDot, otherOnline ? styles.liveDotOn : styles.liveDotOff]} />
      <Text
        style={[type.caption, typingName ? styles.typingText : styles.muted]}
        numberOfLines={1}
      >
        {subtitle}
      </Text>
      {typingName ? <TypingDots /> : null}
    </View>
  );
}

/** Three dots pulsing in a stagger, next to the "Typing…" subtitle. */
function TypingDots() {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    const loops = values.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 300, useNativeDriver: true }),
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

const PRIORITY: Record<Priority, { label: string; mark: string; text: string; bg: string }> = {
  high: { label: 'High', mark: colors.red, text: colors.redText, bg: colors.redSoft },
  medium: { label: 'Medium', mark: colors.amber, text: colors.yellowText, bg: colors.yellowSoft },
  low: { label: 'Low', mark: colors.faint, text: colors.muted, bg: colors.surfaceMuted },
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

/** Memoized: with stable callbacks from ChatScreen, a new message or reaction re-renders only the rows it touches. */
const MessageRow = memo(function MessageRow({
  message,
  isOwn,
  author,
  showHeader,
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
  showHeader: boolean;
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
  const name = isOwn ? 'You' : (author?.name ?? 'Someone');
  const bubbleRef = useRef<View>(null);

  // Measured at press time rather than on layout: the list scrolls, so a
  // cached position would put the picker over the wrong message.
  function handleLongPress() {
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      onAnchor({ messageId: message.id, x, y, width, height, isOwn });
    });
  }

  return (
    <MessageEntry animate={isNew} onSettled={() => onSettled(message.id)}>
      <View style={[styles.row, isOwn && styles.rowOwn]}>
        <View style={[styles.bubbleColumn, isOwn && styles.bubbleColumnOwn]}>
          {showHeader ? (
            <View style={[styles.authorRow, isOwn && styles.authorRowOwn]}>
              {!isOwn && author ? <Avatar {...author} size={18} /> : null}
              <Text style={[type.metadata, styles.author]} numberOfLines={1}>
                {name} · {time}
              </Text>
            </View>
          ) : null}
          <View ref={bubbleRef} collapsable={false}>
            {message.sharedTaskId !== null ? (
              <TaskShareCard
                task={sharedTask}
                membersById={membersById}
                onClaim={onClaim}
                onOpen={onOpen}
                onClaimed={onClaimed}
                onLongPress={handleLongPress}
              />
            ) : message.attachmentPath !== null ? (
              <AttachmentCard message={message} onLongPress={handleLongPress} />
            ) : (
              <Pressable
                onLongPress={handleLongPress}
                delayLongPress={300}
                style={({ pressed }) => [
                  styles.bubble,
                  isOwn ? styles.bubbleOwn : styles.bubbleOther,
                  pressed && styles.bubblePressed,
                ]}
              >
                <Text style={[type.body, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>{message.body}</Text>
              </Pressable>
            )}
          </View>
          {reactions.length > 0 ? (
            <ReactionPills
              reactions={reactions}
              currentUserId={currentUserId}
              onToggle={(emoji) => onToggleReaction(message.id, emoji)}
              align={isOwn ? 'flex-end' : 'flex-start'}
            />
          ) : null}
        </View>
      </View>
    </MessageEntry>
  );
});

function ReactionPills({
  reactions,
  currentUserId,
  onToggle,
  align,
}: {
  reactions: Reaction[];
  currentUserId: string | undefined;
  onToggle: (emoji: string) => void;
  align: 'flex-start' | 'flex-end';
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
        { justifyContent: align, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] },
      ]}
    >
      {Array.from(grouped.entries()).map(([emoji, count]) => (
        <Pressable
          key={emoji}
          onPress={() => onToggle(emoji)}
          style={({ pressed }) => [styles.reactionPill, mine.has(emoji) && styles.reactionPillActive, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={`${emoji} reaction, ${count}${mine.has(emoji) ? ', you reacted' : ''}`}
        >
          <Text style={styles.reactionEmoji}>{emoji}</Text>
          <Text style={[type.tinyLabel, mine.has(emoji) ? styles.reactionCountActive : styles.muted]}>{count}</Text>
        </Pressable>
      ))}
    </Animated.View>
  );
}

/** The composer's send button, and the input's resting height — kept equal so the two bottom-align exactly. */
const SEND_SIZE = 46;

const PICKER_ITEM = 40;
const PICKER_GAP = 6;
const PICKER_PAD = 8;
const PICKER_H = PICKER_ITEM + PICKER_PAD * 2;

function pickerWidth(itemCount: number) {
  return itemCount * PICKER_ITEM + (itemCount - 1) * PICKER_GAP + PICKER_PAD * 2;
}

/**
 * The emoji row, opened against the message it will react to — above it
 * where there's room, below it when the message sits near the top of the
 * screen, and edge-clamped so it never runs off either side. The backdrop
 * is only lightly dimmed on purpose: you need to still see which message
 * you're reacting to, which a full-screen modal defeats.
 *
 * On your own message, a trailing trash icon rides in the same row —
 * "unsend" is just another action on the bubble, not a separate menu.
 * It's never shown on someone else's message: only the author can unsend.
 */
function ReactionPicker({
  anchor,
  topLimit,
  onClose,
  onPick,
  onDeletePress,
}: {
  anchor: PickerAnchor | null;
  /** Lowest y the picker may occupy — below the status bar / header inset. */
  topLimit: number;
  onClose: () => void;
  onPick: (emoji: string) => void;
  onDeletePress: () => void;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  // One extra slot for the delete item, always allocated (hooks can't be
  // conditional) — simply unused when the anchor isn't the viewer's own message.
  const itemScales = useRef([...REACTION_PALETTE, 'delete'].map(() => new Animated.Value(0))).current;

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

  const width = pickerWidth(REACTION_PALETTE.length + (anchor.isOwn ? 1 : 0));
  const screen = Dimensions.get('window');
  const preferredLeft = anchor.isOwn ? anchor.x + anchor.width - width : anchor.x;
  const left = Math.min(Math.max(preferredLeft, 8), Math.max(screen.width - width - 8, 8));
  const above = anchor.y - PICKER_H - 8;
  const top = above >= topLimit ? above : anchor.y + anchor.height + 8;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.pickerBackdrop} onPress={onClose} accessibilityLabel="Close message options">
        <Animated.View
          style={[
            styles.pickerCard,
            {
              left,
              top,
              width,
              opacity: progress,
              transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
            },
          ]}
        >
          {REACTION_PALETTE.map((emoji, i) => (
            <Animated.View key={emoji} style={{ transform: [{ scale: itemScales[i] }] }}>
              <Pressable
                onPress={() => onPick(emoji)}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
                style={({ pressed }) => [styles.pickerItem, pressed && styles.pickerItemPressed]}
              >
                <Text style={styles.pickerEmoji}>{emoji}</Text>
              </Pressable>
            </Animated.View>
          ))}
          {anchor.isOwn ? (
            <Animated.View style={{ transform: [{ scale: itemScales[REACTION_PALETTE.length] }] }}>
              <Pressable
                onPress={onDeletePress}
                accessibilityRole="button"
                accessibilityLabel="Unsend this message"
                style={({ pressed }) => [styles.pickerItem, pressed && styles.pickerItemPressed]}
              >
                <Icon name="trash" size={17} color={colors.redText} strokeWidth={1.9} />
              </Pressable>
            </Animated.View>
          ) : null}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function TaskShareCard({
  task,
  membersById,
  onClaim,
  onOpen,
  onClaimed,
  onLongPress,
}: {
  task: Task | null;
  membersById: Record<string, Member>;
  onClaim: (taskId: string) => Promise<{ error: string | null }>;
  onOpen: (taskId: string) => void;
  onClaimed: (task: Task) => void;
  onLongPress: () => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!task) {
    return (
      <View style={styles.taskCard}>
        <Text style={[type.caption, styles.muted]}>This task was deleted.</Text>
      </View>
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
  // Anyone in the project can take an unclaimed task — claiming is
  // first-come-first-served (see ProjectRepository's claimTask), so this is
  // everyone, not a shortlist.
  const claimers = Object.values(membersById);

  return (
    <Pressable
      onPress={() => onOpen(task!.id)}
      onLongPress={onLongPress}
      delayLongPress={300}
      accessibilityRole="button"
      accessibilityLabel={`Open ${task.title}`}
      style={({ pressed }) => [styles.taskCard, pressed && styles.taskCardPressed]}
    >
      <View style={styles.taskCardHeader}>
        <TaskStatusDot status={task.status} size={18} />
        <Text style={[type.metadata, styles.taskCardEyebrow]} numberOfLines={1}>
          {task.assigneeId === null ? 'UP FOR GRABS' : 'SHARED TASK'}
        </Text>
      </View>

      <Text style={[type.taskTitle, styles.ink, styles.taskCardTitle]} numberOfLines={2}>
        {task.title}
      </Text>

      <View style={styles.taskCardMeta}>
        <View style={[styles.taskCardPriority, { backgroundColor: priority.bg }]}>
          <Icon name="flag" size={11} color={priority.mark} fill={priority.mark} strokeWidth={1.8} />
          <Text style={[type.tinyLabel, { color: priority.text }]}>{priority.label}</Text>
        </View>
        {task.effortHours ? (
          <View style={styles.taskCardMetaItem}>
            <Icon name="clock" size={12} color={colors.muted} strokeWidth={1.8} />
            <Text style={[type.tinyLabel, styles.muted]}>{Number(task.effortHours.toFixed(1))}h</Text>
          </View>
        ) : null}
        {task.dueLabel ? (
          <View style={styles.taskCardMetaItem}>
            <Icon name="calendar" size={12} color={task.dueUrgent ? colors.redText : colors.muted} strokeWidth={1.8} />
            <Text style={[type.tinyLabel, task.dueUrgent ? styles.dueUrgent : styles.muted]}>{task.dueLabel}</Text>
          </View>
        ) : null}
      </View>

      {task.assigneeId === null ? (
        <View style={styles.taskCardFooter}>
          {/* Who could take this, the way the reference card stacks faces
              beside its action — real teammates, not decoration. */}
          <View style={styles.taskCardFaces}>
            {claimers.slice(0, 3).map((m, i) => (
              <Avatar key={m.id} {...m} size={22} borderColor={colors.surface} style={i > 0 ? styles.faceOverlap : undefined} />
            ))}
            {claimers.length > 3 ? (
              <Text style={[type.tinyLabel, styles.muted, styles.facesMore]}>+{claimers.length - 3}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={handleClaim}
            disabled={claiming}
            style={({ pressed }) => [styles.taskCardClaim, (claiming || pressed) && styles.taskCardClaimDisabled]}
            accessibilityRole="button"
            accessibilityLabel={`Claim ${task.title}`}
          >
            <Text style={[type.button, styles.onInk]}>{claiming ? 'Claiming…' : 'Claim it'}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.taskCardAssignee}>
          {assignee ? <Avatar {...assignee} size={20} /> : null}
          <Text style={[type.caption, styles.muted]} numberOfLines={1}>
            {assignee ? `Claimed by ${assignee.name}` : 'Claimed'}
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

/**
 * Images get their own path (ImageAttachmentCard below): a thumbnail in the
 * bubble and a real in-app viewer. Everything else — PDFs, docs, audio,
 * video — still opens through the OS via Linking, which is the right tool
 * for those; the "opens like a link, not a downloadable image" complaint
 * was specific to images, where handing a signed URL to the OS puts it in
 * a browser tab with no save affordance most Android browsers surface.
 */
function AttachmentCard({ message, onLongPress }: { message: Message; onLongPress: () => void }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (message.attachmentType?.startsWith('image/')) {
    return <ImageAttachmentCard message={message} onLongPress={onLongPress} />;
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

  return (
    <Pressable
      onPress={handleOpen}
      onLongPress={onLongPress}
      delayLongPress={300}
      disabled={opening}
      accessibilityRole="button"
      accessibilityLabel={`Open ${message.attachmentName}`}
      style={({ pressed }) => [styles.attachmentCard, pressed && styles.taskCardPressed]}
    >
      <View style={styles.attachmentIconTile}>
        {opening ? (
          <ActivityIndicator size="small" color={colors.purple} />
        ) : (
          <Icon name={attachmentIcon(message.attachmentType)} size={18} color={colors.purple} strokeWidth={1.8} />
        )}
      </View>
      <View style={styles.attachmentInfo}>
        <Text style={[type.body, styles.ink]} numberOfLines={1}>
          {message.attachmentName}
        </Text>
        {message.attachmentSize !== null ? (
          <Text style={[type.caption, styles.muted]}>{formatFileSize(message.attachmentSize)}</Text>
        ) : null}
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
function ImageAttachmentCard({ message, onLongPress }: { message: Message; onLongPress: () => void }) {
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
        style={styles.imageThumbWrap}
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
  titleCapsule: {
    flex: 1,
    height: 48,
  },
  titleInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 1,
  },
  typingText: {
    color: colors.mintText,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveDotOn: {
    backgroundColor: colors.green,
  },
  liveDotOff: {
    backgroundColor: colors.faint,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 3,
    marginLeft: 2,
  },
  typingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.muted,
  },
  pressed: {
    opacity: 0.6,
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
  emptyTile: {
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: layout.iconTileRadius,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 12,
    gap: 10,
  },
  row: {
    // Both sides now sit at exactly layout.screenPadding from their own
    // edge — the list's padding is the only inset either one gets.
    alignSelf: 'flex-start',
    // 78% rather than 86%: a bubble that nearly spans the screen stops
    // reading as a side, which is the thing that tells you who spoke.
    maxWidth: '78%',
  },
  rowOwn: {
    alignSelf: 'flex-end',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  authorRowOwn: {
    justifyContent: 'flex-end',
  },
  bubbleColumn: {
    gap: 3,
    flexShrink: 1,
  },
  bubbleColumnOwn: {
    alignItems: 'flex-end',
  },
  author: {
    color: colors.muted,
    flexShrink: 1,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubblePressed: {
    opacity: 0.85,
  },
  bubbleOther: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderTopLeftRadius: 4,
  },
  bubbleOwn: {
    backgroundColor: colors.purple,
    borderTopRightRadius: 4,
  },
  bubbleTextOther: {
    color: colors.ink,
  },
  bubbleTextOwn: {
    color: colors.onInk,
  },
  taskCard: {
    width: 240,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.purpleSoft,
    padding: 14,
    gap: 10,
  },
  taskCardPressed: {
    opacity: 0.85,
  },
  taskCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskCardEyebrow: {
    flex: 1,
    color: colors.muted,
    letterSpacing: 0.5,
  },
  taskCardTitle: {
    marginTop: -2,
  },
  taskCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  taskCardFaces: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faceOverlap: {
    marginLeft: -8,
  },
  facesMore: {
    marginLeft: 6,
  },
  taskCardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  taskCardPriority: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  taskCardMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueUrgent: {
    color: colors.redText,
  },
  taskCardClaim: {
    height: 36,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCardClaimDisabled: {
    opacity: 0.6,
  },
  taskCardAssignee: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  attachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: 220,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 12,
  },
  attachmentIconTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentInfo: {
    flex: 1,
    minWidth: 0,
    gap: 1,
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
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 10,
  },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  attachChipPressed: {
    backgroundColor: colors.surfaceMuted,
    opacity: 0.8,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: layout.screenPadding,
  },
  attachButton: {
    marginBottom: 0,
  },
  inputCapsule: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingLeft: 6,
    paddingRight: 5,
    paddingVertical: 4,
  },
  // Height is pinned to the send button's so the two bottom-align cleanly;
  // it only grows past that once the text actually wraps. No box of its own:
  // the glass capsule around it is the field.
  input: {
    flex: 1,
    minHeight: SEND_SIZE - 2,
    maxHeight: 120,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    color: colors.ink,
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
  },
  sendButton: {
    width: SEND_SIZE - 2,
    height: SEND_SIZE - 2,
    borderRadius: (SEND_SIZE - 2) / 2,
    overflow: 'hidden',
  },
  sendButtonPressed: {
    transform: [{ scale: 0.92 }],
  },
  sendFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendFillDisabled: {
    backgroundColor: colors.surfaceMuted,
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
  reactionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: 8,
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  reactionPillActive: {
    backgroundColor: colors.purpleSoft,
    borderColor: colors.purple,
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCountActive: {
    color: colors.purple,
  },
  // Barely dimmed: the point of anchoring the picker is that you can still
  // see the message you're reacting to.
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,15,26,0.12)',
  },
  pickerCard: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: PICKER_GAP,
    // width is set inline per-anchor (pickerWidth) — it depends on whether
    // the delete item is shown, so there's no single static value here.
    height: PICKER_H,
    padding: PICKER_PAD,
    backgroundColor: colors.surface,
    borderRadius: PICKER_H / 2,
    shadowColor: '#1C1633',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  pickerItem: {
    width: PICKER_ITEM,
    height: PICKER_ITEM,
    borderRadius: PICKER_ITEM / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerItemPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  pickerEmoji: {
    fontSize: 24,
  },
});

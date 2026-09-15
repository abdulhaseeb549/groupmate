import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { TaskStatusDot } from '../components/TaskStatusDot';
import { Member } from '../data/member';
import { Priority, Task } from '../data/tasks';
import { useAuth } from '../state/AuthProvider';
import {
  addReaction,
  belongsToConversation,
  Conversation,
  fetchMessages,
  fetchReactions,
  getAttachmentUrl,
  Message,
  Reaction,
  removeReaction,
  sendAttachment,
  sendMessage,
  subscribeToMessages,
  subscribeToReactions,
} from '../state/messages';
import { pickFile } from '../utils/filePicker';
import { useProject } from '../state/ProjectRepository';
import { colors, gradients, layout, type } from '../theme';
import { formatTime } from '../utils/dates';

type Props = {
  conversation: Conversation;
  onBack: () => void;
};

/**
 * One conversation's message list + composer — either the project's group
 * chat or a 1:1 with one other member (see ChatListScreen for where a
 * conversation gets picked). A message is either plain text or a shared
 * task-claim card (see state/messages.ts). Sending is await-then-let-
 * Realtime-echo-it-back rather than optimistic: there's no client-side id
 * to show ahead of the insert (same reasoning as ProjectRepository's
 * addTask), and Realtime typically confirms fast enough not to feel laggy.
 */
export function ChatScreen({ conversation, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const { project, tasks, membersById, claimTask } = useProject();
  const { session } = useAuth();
  const currentUserId = session?.user.id;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [claimedTask, setClaimedTask] = useState<Task | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  function handleClaimed(task: Task) {
    setClaimedTask(task);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!currentUserId) return;
    const mine = reactions.some((r) => r.messageId === messageId && r.userId === currentUserId && r.emoji === emoji);
    // Optimistic, same as the rest of this app's simple toggles — reverted on failure below.
    setReactions((prev) =>
      mine
        ? prev.filter((r) => !(r.messageId === messageId && r.userId === currentUserId && r.emoji === emoji))
        : [...prev, { messageId, userId: currentUserId, emoji }]
    );
    try {
      if (mine) {
        await removeReaction(messageId, currentUserId, emoji);
      } else {
        await addReaction(messageId, project.id, currentUserId, emoji);
      }
    } catch {
      setReactions((prev) =>
        mine
          ? [...prev, { messageId, userId: currentUserId, emoji }]
          : prev.filter((r) => !(r.messageId === messageId && r.userId === currentUserId && r.emoji === emoji))
      );
    }
  }

  const title = conversation.type === 'group' ? project.name : (membersById[conversation.otherUserId]?.name ?? 'Direct message');
  const subtitle = conversation.type === 'group' ? project.team : 'Direct message';

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    setMessages(null);
    setLoadError(null);

    fetchMessages(project.id, currentUserId, conversation)
      .then((data) => {
        if (cancelled) return;
        setMessages(data);
        return fetchReactions(data.map((m) => m.id));
      })
      .then((data) => {
        if (!cancelled && data) setReactions(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load messages.');
      });

    const unsubscribe = subscribeToMessages(project.id, (message) => {
      if (!belongsToConversation(message, currentUserId, conversation)) return;
      setMessages((prev) => {
        const base = prev ?? [];
        if (base.some((m) => m.id === message.id)) return base;
        return [...base, message];
      });
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // conversation is a fresh object per render from ChatTab's state, so
    // key off its actual identity rather than the object reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, currentUserId, conversation.type, conversation.type === 'dm' ? conversation.otherUserId : null]);

  // Project-wide, not scoped to this conversation's messages — harmless to
  // hold a few extra reactions for other threads in memory, and this
  // avoids re-subscribing every time the loaded message set changes.
  useEffect(() => {
    const unsubscribe = subscribeToReactions(project.id, (event) => {
      setReactions((prev) => {
        const matches = (r: Reaction) =>
          r.messageId === event.reaction.messageId && r.userId === event.reaction.userId && r.emoji === event.reaction.emoji;
        if (event.type === 'insert') {
          return prev.some(matches) ? prev : [...prev, event.reaction];
        }
        return prev.filter((r) => !matches(r));
      });
    });
    return unsubscribe;
  }, [project.id]);

  async function handleSend() {
    const body = input.trim();
    if (!body || sending || !currentUserId) return;
    setSending(true);
    setInput('');
    try {
      await sendMessage(project.id, currentUserId, body, conversation.type === 'dm' ? conversation.otherUserId : null);
    } catch {
      setInput(body);
    }
    setSending(false);
  }

  async function handleAttach() {
    if (attaching || !currentUserId) return;
    setAttachError(null);
    const { file, error } = await pickFile();
    if (error) {
      setAttachError(error);
      return;
    }
    if (!file) return;
    setAttaching(true);
    try {
      await sendAttachment(project.id, currentUserId, file, conversation.type === 'dm' ? conversation.otherUserId : null);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Could not send that file.');
    }
    setAttaching(false);
  }

  return (
    <>
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 40) + 14 }]}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back to chats"
          style={styles.backButton}
        >
          <Icon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={type.pageTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[type.body, styles.muted]} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>

      {messages === null ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={colors.purple} />
        </View>
      ) : loadError ? (
        <View style={styles.centerBox}>
          <Icon name="exclamation" size={20} color={colors.redText} strokeWidth={2.2} />
          <Text style={[type.body, styles.muted, styles.centerText]}>{loadError}</Text>
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.centerBox}>
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
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            const prevItem = index > 0 ? messages[index - 1] : undefined;
            const showHeader = !prevItem || prevItem.authorId !== item.authorId;
            const sharedTask = item.sharedTaskId ? (tasks.find((t) => t.id === item.sharedTaskId) ?? null) : null;
            return (
              <MessageRow
                message={item}
                isOwn={item.authorId === currentUserId}
                author={membersById[item.authorId]}
                showHeader={showHeader}
                sharedTask={sharedTask}
                membersById={membersById}
                onClaim={claimTask}
                onOpen={setOpenTaskId}
                onClaimed={handleClaimed}
                reactions={reactions.filter((r) => r.messageId === item.id)}
                currentUserId={currentUserId}
                onToggleReaction={toggleReaction}
                onLongPress={() => setReactionPickerMessageId(item.id)}
              />
            );
          }}
        />
      )}

      {attachError ? (
        <View style={styles.attachErrorBox}>
          <Icon name="exclamation" size={14} color={colors.redText} strokeWidth={2.2} />
          <Text style={[type.caption, styles.errorText]} numberOfLines={2}>
            {attachError}
          </Text>
        </View>
      ) : null}

      <View style={[styles.composer, { marginBottom: Math.max(insets.bottom, 12) + 10 }]}>
        <Pressable
          onPress={handleAttach}
          disabled={attaching}
          accessibilityRole="button"
          accessibilityLabel="Attach a file"
          style={[styles.attachButton, attaching && styles.attachButtonDisabled]}
        >
          {attaching ? <ActivityIndicator size="small" color={colors.muted} /> : <Icon name="plus" size={18} color={colors.muted} strokeWidth={2} />}
        </Pressable>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={conversation.type === 'group' ? 'Message your team…' : `Message ${title}…`}
          placeholderTextColor={colors.faint}
          multiline
          style={styles.input}
        />
        <Pressable
          onPress={handleSend}
          disabled={!input.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={styles.sendButton}
        >
          <LinearGradient
            colors={gradients.purpleDeep}
            start={{ x: 0.25, y: 0 }}
            end={{ x: 0.75, y: 1 }}
            style={[styles.sendGradient, (!input.trim() || sending) && styles.sendGradientDisabled]}
          >
            <Icon name="chevronUp" size={18} color={colors.onInk} strokeWidth={2.4} />
          </LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>

      <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} onClaimed={handleClaimed} />
      <TaskClaimedModal task={claimedTask} onClose={() => setClaimedTask(null)} onView={setOpenTaskId} />
      <ReactionPickerModal
        messageId={reactionPickerMessageId}
        onClose={() => setReactionPickerMessageId(null)}
        onPick={(emoji) => {
          if (reactionPickerMessageId) toggleReaction(reactionPickerMessageId, emoji);
          setReactionPickerMessageId(null);
        }}
      />
    </>
  );
}

const REACTION_PALETTE = ['❤️', '👍', '🎉', '👏', '😄'];

const PRIORITY: Record<Priority, { label: string; mark: string; text: string; bg: string }> = {
  high: { label: 'High', mark: colors.red, text: colors.redText, bg: colors.redSoft },
  medium: { label: 'Medium', mark: colors.amber, text: colors.yellowText, bg: colors.yellowSoft },
  low: { label: 'Low', mark: colors.faint, text: colors.muted, bg: colors.surfaceMuted },
};

function MessageRow({
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
  onLongPress,
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
  onLongPress: () => void;
}) {
  const time = formatTime(new Date(message.createdAt));
  const name = isOwn ? 'You' : (author?.name ?? 'Someone');

  return (
    <View style={[styles.row, isOwn && styles.rowOwn]}>
      {!isOwn ? (
        <View style={styles.avatarSlot}>
          {showHeader ? (
            author ? (
              <Avatar {...author} size={28} />
            ) : (
              <View style={styles.avatarPlaceholder} />
            )
          ) : null}
        </View>
      ) : null}
      <View style={[styles.bubbleColumn, isOwn && styles.bubbleColumnOwn]}>
        {showHeader ? (
          <Text style={[type.metadata, styles.author, isOwn && styles.authorOwn]} numberOfLines={1}>
            {name} · {time}
          </Text>
        ) : null}
        {message.sharedTaskId !== null ? (
          <TaskShareCard task={sharedTask} membersById={membersById} onClaim={onClaim} onOpen={onOpen} onClaimed={onClaimed} onLongPress={onLongPress} />
        ) : message.attachmentPath !== null ? (
          <AttachmentCard message={message} onLongPress={onLongPress} />
        ) : (
          <Pressable
            onLongPress={onLongPress}
            delayLongPress={350}
            style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}
          >
            <Text style={[type.body, isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther]}>{message.body}</Text>
          </Pressable>
        )}
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
  );
}

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
  const grouped = new Map<string, number>();
  const mine = new Set<string>();
  for (const r of reactions) {
    grouped.set(r.emoji, (grouped.get(r.emoji) ?? 0) + 1);
    if (r.userId === currentUserId) mine.add(r.emoji);
  }

  return (
    <View style={[styles.reactionRow, { justifyContent: align }]}>
      {Array.from(grouped.entries()).map(([emoji, count]) => (
        <Pressable
          key={emoji}
          onPress={() => onToggle(emoji)}
          style={[styles.reactionPill, mine.has(emoji) && styles.reactionPillActive]}
          accessibilityRole="button"
          accessibilityLabel={`${emoji} reaction, ${count}${mine.has(emoji) ? ', you reacted' : ''}`}
        >
          <Text style={styles.reactionEmoji}>{emoji}</Text>
          <Text style={[type.tinyLabel, mine.has(emoji) ? styles.reactionCountActive : styles.muted]}>{count}</Text>
        </Pressable>
      ))}
    </View>
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

  return (
    <Pressable
      onPress={() => onOpen(task!.id)}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`Open ${task.title}`}
      style={styles.taskCard}
    >
      <View style={styles.taskCardHeader}>
        <TaskStatusDot status={task.status} size={18} />
        <Text style={[type.taskTitle, styles.ink, styles.taskCardTitle]} numberOfLines={2}>
          {task.title}
        </Text>
      </View>

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
        <Pressable
          onPress={handleClaim}
          disabled={claiming}
          style={[styles.taskCardClaim, claiming && styles.taskCardClaimDisabled]}
          accessibilityRole="button"
          accessibilityLabel={`Claim ${task.title}`}
        >
          <Text style={[type.button, styles.onInk]}>{claiming ? 'Claiming…' : 'Claim this task'}</Text>
        </Pressable>
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

function AttachmentCard({ message, onLongPress }: { message: Message; onLongPress: () => void }) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      delayLongPress={350}
      disabled={opening}
      accessibilityRole="button"
      accessibilityLabel={`Open ${message.attachmentName}`}
      style={styles.attachmentCard}
    >
      <View style={styles.attachmentIconTile}>
        {opening ? <ActivityIndicator size="small" color={colors.purple} /> : <Icon name="document" size={18} color={colors.purple} strokeWidth={1.8} />}
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

function ReactionPickerModal({
  messageId,
  onClose,
  onPick,
}: {
  messageId: string | null;
  onClose: () => void;
  onPick: (emoji: string) => void;
}) {
  return (
    <Modal visible={messageId !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.claimedBackdrop} onPress={onClose}>
        <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
          {REACTION_PALETTE.map((emoji) => (
            <Pressable
              key={emoji}
              onPress={() => onPick(emoji)}
              accessibilityRole="button"
              accessibilityLabel={`React with ${emoji}`}
              style={styles.pickerItem}
            >
              <Text style={styles.pickerEmoji}>{emoji}</Text>
            </Pressable>
          ))}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
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
    flexDirection: 'row',
    gap: 8,
    maxWidth: '86%',
  },
  rowOwn: {
    alignSelf: 'flex-end',
  },
  avatarSlot: {
    width: 28,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
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
    marginLeft: 2,
  },
  authorOwn: {
    marginLeft: 0,
    marginRight: 2,
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
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
  taskCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  taskCardTitle: {
    flex: 1,
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
    height: 40,
    borderRadius: 20,
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
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: layout.screenPadding,
    paddingTop: 8,
  },
  attachButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  attachButtonDisabled: {
    opacity: 0.6,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.ink,
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
  },
  sendGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendGradientDisabled: {
    opacity: 0.4,
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
    borderRadius: 24,
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
  pickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 10,
  },
  pickerItem: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerEmoji: {
    fontSize: 24,
  },
});

import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './Avatar';
import { Icon, IconName } from './Icon';
import { ActivityItem, ActivityKind, fetchActivity } from '../state/activity';
import { Conversation } from '../state/messages';
import { useAuth } from '../state/AuthProvider';
import { useChatUnread } from '../state/chatUnread';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, radius, type } from '../theme';
import { formatRelative } from '../utils/dates';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Opening a message entry should land in that conversation, not just close the sheet. */
  onOpenConversation: (conversation: Conversation) => void;
};

const ICON: Record<ActivityKind, IconName> = {
  join: 'users',
  message: 'chat',
  task: 'check',
};

/**
 * What the bell opens. Before this, the bell had no onPress at all and a
 * permanently lit dot — it promised a place where things that happened were
 * collected, and there wasn't one.
 *
 * Unread conversations come from the chat state that already tracks them,
 * rather than being refetched here, so the sheet and the Chat tab can never
 * disagree about what you have read.
 */
export function ActivitySheet({ visible, onClose, onOpenConversation }: Props) {
  const insets = useSafeAreaInsets();
  const { project, membersById } = useProject();
  const { session } = useAuth();
  const { summaries, isUnread } = useChatUnread();
  const userId = session?.user.id;
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !userId) return;
    let cancelled = false;
    setItems(null);
    setError(null);
    fetchActivity(project.id, userId, membersById)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load activity.');
      });
    return () => {
      cancelled = true;
    };
  }, [visible, project.id, userId, membersById]);

  // Unread threads are merged in at render rather than fetched: they are
  // already live in ChatUnreadProvider, and a message that arrives while
  // this sheet is open should appear without a refetch.
  const unread: ActivityItem[] = Object.values(summaries)
    .filter((summary) => isUnread(summary.conversation))
    .map((summary) => {
      const author = membersById[summary.lastAuthorId];
      return {
        id: 'msg:' + summary.key,
        kind: 'message' as const,
        at: summary.lastAt,
        title:
          summary.conversation.type === 'group'
            ? `${author ? author.name.split(' ')[0] : 'Someone'} in Team chat`
            : `${author ? author.name.split(' ')[0] : 'Someone'} messaged you`,
        detail: summary.preview,
        member: author,
      };
    });

  const merged = [...unread, ...(items ?? [])].sort((a, b) => b.at.localeCompare(a.at));

  function handlePress(item: ActivityItem) {
    if (item.kind !== 'message') return;
    const summary = Object.values(summaries).find((s) => 'msg:' + s.key === item.id);
    if (!summary) return;
    onClose();
    onOpenConversation(summary.conversation);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.grabber} />
        <Text style={[type.projectTitle, styles.ink, styles.heading]}>Activity</Text>

        {items === null && !error ? (
          <ActivityIndicator color={colors.purple} style={styles.loading} />
        ) : error ? (
          <View style={styles.errorBox}>
            <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
            <Text style={[type.caption, styles.errorText]}>{error}</Text>
          </View>
        ) : merged.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[type.taskTitle, styles.ink]}>Nothing new</Text>
            <Text style={[type.caption, styles.muted]}>
              Teammates joining, new tasks, and messages you haven't read show up here.
            </Text>
          </View>
        ) : (
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {merged.map((item) => {
              const pressable = item.kind === 'message';
              return (
                <Pressable
                  key={item.id}
                  onPress={() => handlePress(item)}
                  disabled={!pressable}
                  accessibilityRole={pressable ? 'button' : undefined}
                  style={({ pressed }) => [styles.row, pressed && pressable && styles.rowPressed]}
                >
                  {item.member ? (
                    <Avatar {...item.member} size={38} />
                  ) : (
                    <View style={styles.tile}>
                      <Icon name={ICON[item.kind]} size={18} color={colors.muted} strokeWidth={1.9} />
                    </View>
                  )}
                  <View style={styles.rowText}>
                    <Text style={[type.taskTitle, styles.ink]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={[type.caption, styles.muted]} numberOfLines={1}>
                      {item.detail}
                    </Text>
                  </View>
                  <Text style={[type.tinyLabel, styles.when]}>{formatRelative(item.at)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,17,17,0.35)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: layout.screenPadding,
    paddingTop: 10,
    maxHeight: '75%',
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  heading: {
    marginBottom: 6,
  },
  loading: {
    paddingVertical: 32,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: radius.control,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  tile: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  when: {
    color: colors.faint,
  },
  empty: {
    gap: 4,
    paddingVertical: 20,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.redSoft,
    borderRadius: radius.control,
    padding: layout.cardPadding,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    color: colors.redText,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
});

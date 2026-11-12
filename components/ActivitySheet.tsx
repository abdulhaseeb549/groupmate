import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './Avatar';
import { Icon, IconName } from './Icon';
import { Sheet } from './Sheet';
import { ActivityItem, ActivityKind, fetchActivity } from '../state/activity';
import { Conversation } from '../state/messages';
import { useAuth } from '../state/AuthProvider';
import { useChatUnread } from '../state/chatUnread';
import { useProject } from '../state/ProjectRepository';
import { colors, type } from '../theme';
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
  task: 'tick',
};

/**
 * Board GActivity: what the bell opens. Unread conversations come from the
 * chat state that already tracks them, rather than being refetched here, so
 * the sheet and the Chat tab can never disagree about what you have read.
 * Unread ones carry a coral dot on the face and are counted in the "N new" pill.
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
      const first = author ? author.name.split(' ')[0] : 'Someone';
      return {
        id: 'msg:' + summary.key,
        kind: 'message' as const,
        at: summary.lastAt,
        title: summary.conversation.type === 'group' ? `${first} in Team chat` : `${first} messaged you`,
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
    <Sheet visible={visible} onClose={onClose}>
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: Math.max(insets.bottom, 0) + 34 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Activity
          </Text>
          {unread.length > 0 ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>{unread.length} new</Text>
            </View>
          ) : null}
        </View>

        {items === null && !error ? (
          <View style={styles.list} accessibilityLabel="Loading activity">
            {[0, 1, 2].map((i) => (
              <View key={i}>
                {i > 0 ? <View style={styles.sep} /> : null}
                <View style={styles.row}>
                  <View style={[styles.face, styles.ghost]} />
                  <View style={styles.text}>
                    <View style={[styles.ghostBar, { width: '55%' }]} />
                    <View style={[styles.ghostBar, { width: '80%' }]} />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
            <Text style={[styles.m, styles.errorText]}>{error}</Text>
          </View>
        ) : merged.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.t}>Nothing new</Text>
            <Text style={styles.m}>Teammates joining, new tasks, and messages you haven't read show up here.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {merged.map((item, i) => {
              const pressable = item.kind === 'message';
              const fresh = item.id.startsWith('msg:');
              const when = formatRelative(item.at);
              return (
                <View key={item.id}>
                  {i > 0 ? <View style={styles.sep} /> : null}
                  <Pressable
                    onPress={() => handlePress(item)}
                    disabled={!pressable}
                    accessibilityRole={pressable ? 'button' : undefined}
                    accessibilityLabel={`${item.title}: ${item.detail}, ${when}${pressable ? '. Open chat' : ''}`}
                    style={({ pressed }) => [styles.row, pressed && pressable && styles.pressed]}
                  >
                    {item.member ? (
                      <View style={styles.face}>
                        <Avatar {...item.member} size={40} />
                        {fresh ? <View style={styles.newDot} /> : null}
                      </View>
                    ) : (
                      <View style={styles.tile}>
                        <Icon name={ICON[item.kind]} size={19} color={colors.muted} strokeWidth={2} />
                      </View>
                    )}
                    <View style={styles.text}>
                      <Text style={styles.t} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.m} numberOfLines={1}>
                        {item.detail}
                      </Text>
                    </View>
                    <Text style={styles.when}>{when}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
  },
  title: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  pill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: colors.redSoft,
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: type.badge.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.redText,
  },
  list: {
    marginTop: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.6,
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ECEAF0',
    marginLeft: 52,
  },
  face: {
    width: 40,
    height: 40,
  },
  newDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E95B57',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  t: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  m: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  when: {
    alignSelf: 'flex-start',
    marginTop: 3,
    fontFamily: type.caption.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: '#9D99A6',
  },
  ghost: {
    borderRadius: 20,
    backgroundColor: 'rgba(21,21,26,0.05)',
  },
  ghostBar: {
    height: 12,
    borderRadius: 6,
    marginVertical: 3,
    backgroundColor: 'rgba(21,21,26,0.05)',
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
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  errorText: {
    flex: 1,
    color: colors.redText,
  },
});

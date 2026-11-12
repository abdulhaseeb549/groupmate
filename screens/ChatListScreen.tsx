import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { BottomNav, NavTab } from '../components/BottomNav';
import { GlassScene, GlassTarget } from '../components/Glass';
import { FadeIn } from '../components/FadeIn';
import { Icon } from '../components/Icon';
import { InviteModal } from '../components/InviteModal';
import { Conversation, conversationKey } from '../state/messages';
import { useAuth } from '../state/AuthProvider';
import { useChatUnread } from '../state/chatUnread';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, radius, type } from '../theme';
import { formatTime } from '../utils/dates';

type Props = {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenConversation: (conversation: Conversation) => void;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today: the time. This week: the weekday. Older: the date. Like every chat app. */
function chatTime(iso: string | undefined, now: Date): string {
  if (!iso) return '';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86400000);
  if (days <= 0) return formatTime(at);
  if (days < 7) return WEEKDAYS[at.getDay()];
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`;
}

/**
 * Where the Chat tab actually lands — a WhatsApp-style pick list: the one
 * team-wide group conversation, then a 1:1 row per other member. Tapping
 * either opens ChatScreen scoped to that conversation.
 */
export function ChatListScreen({ activeTab, onSelectTab, onOpenConversation }: Props) {
  const insets = useSafeAreaInsets();
  const { project, members, onlineUserIds } = useProject();
  const { session } = useAuth();
  const { summaries, isUnread, hasUnread } = useChatUnread();
  const currentUserId = session?.user.id;
  const [inviteOpen, setInviteOpen] = useState(false);
  const now = new Date();

  // Most recently active first, like any chat app — a teammate who just
  // messaged you shouldn't be buried under one who never has. Ties (nobody
  // has messaged yet) fall back to name so the order stays stable.
  const teammates = members
    .filter((m) => m.id !== currentUserId)
    .slice()
    .sort((a, b) => {
      const aAt = summaries[conversationKey({ type: 'dm', otherUserId: a.id })]?.lastAt ?? '';
      const bAt = summaries[conversationKey({ type: 'dm', otherUserId: b.id })]?.lastAt ?? '';
      if (aAt !== bAt) return bAt.localeCompare(aAt);
      return a.name.localeCompare(b.name);
    });

  const groupSummary = summaries[conversationKey({ type: 'group' })];
  const groupUnread = isUnread({ type: 'group' });

  return (
    <GlassScene style={styles.screen}>
      <GlassTarget>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 40) + 14, paddingBottom: 130 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
          <View style={styles.header}>
            <Text style={type.pageTitle}>Chats</Text>
            <Text style={[type.body, styles.muted]}>{project.name}</Text>
          </View>
        </FadeIn>

        <FadeIn delay={70}>
        <View style={styles.list}>
          <Pressable
            onPress={() => onOpenConversation({ type: 'group' })}
            accessibilityRole="button"
            accessibilityLabel={`Team chat, ${members.length} members${groupUnread ? ', unread' : ''}`}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.groupTile}>
              <Icon name="users" size={22} color={colors.purple} strokeWidth={1.8} />
            </View>
            <View style={styles.rowText}>
              <View style={styles.topLine}>
                <Text style={[type.taskTitle, styles.ink, styles.name]} numberOfLines={1}>
                  Team chat
                </Text>
                <Text style={[type.metadata, styles.time]}>{chatTime(groupSummary?.lastAt, now)}</Text>
              </View>
              <View style={styles.bottomLine}>
                <Text
                  style={[type.caption, styles.preview, groupUnread ? styles.unreadText : styles.muted]}
                  numberOfLines={1}
                >
                  {groupSummary
                    ? groupSummary.preview
                    : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}
                </Text>
                {groupUnread ? <View style={styles.unreadDot} /> : null}
              </View>
            </View>
          </Pressable>

          {teammates.map((member) => {
            const conversation: Conversation = { type: 'dm', otherUserId: member.id };
            const summary = summaries[conversationKey(conversation)];
            const unread = isUnread(conversation);
            return (
              <View key={member.id}>
                <View style={styles.hair} />
                <Pressable
                  onPress={() => onOpenConversation(conversation)}
                  accessibilityRole="button"
                  accessibilityLabel={`Direct message with ${member.name}${unread ? ', unread' : ''}`}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <View style={styles.avatarWrap}>
                    <Avatar {...member} size={46} />
                    {onlineUserIds.has(member.id) ? <View style={styles.onlineDot} /> : null}
                  </View>
                  <View style={styles.rowText}>
                    <View style={styles.topLine}>
                      <Text style={[type.taskTitle, styles.ink, styles.name]} numberOfLines={1}>
                        {member.name}
                      </Text>
                      <Text style={[type.metadata, styles.time]}>{chatTime(summary?.lastAt, now)}</Text>
                    </View>
                    <View style={styles.bottomLine}>
                      <Text
                        style={[
                          type.caption,
                          styles.preview,
                          unread ? styles.unreadText : summary ? styles.muted : styles.faint,
                        ]}
                        numberOfLines={1}
                      >
                        {summary ? summary.preview : 'Say hi'}
                      </Text>
                      {unread ? <View style={styles.unreadDot} /> : null}
                    </View>
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* The only way anyone else gets into this project — and so into
            this list — is an invite code, so the way to send one lives
            here rather than only behind the "+" menu. */}
        <Pressable
          onPress={() => setInviteOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Invite teammates"
          style={({ pressed }) => [styles.inviteRow, pressed && styles.rowPressed]}
        >
          <View style={styles.inviteTile}>
            <Icon name="plus" size={16} color={colors.purple} strokeWidth={2.4} />
          </View>
          <Text style={[type.button, styles.action]}>Invite teammates</Text>
        </Pressable>
        </FadeIn>
      </ScrollView>
      </GlassTarget>

      <BottomNav active={activeTab} onSelect={onSelectTab} chatUnread={hasUnread} />
      <InviteModal visible={inviteOpen} onClose={() => setInviteOpen(false)} />
    </GlassScene>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    gap: layout.sectionGap,
  },
  header: {
    gap: 4,
  },
  muted: {
    color: colors.muted,
  },
  ink: {
    color: colors.ink,
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 72,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  // Starts where the text starts (16 padding + 46 avatar + 14 gap).
  hair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 76,
  },
  avatarWrap: {
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  groupTile: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    flex: 1,
  },
  time: {
    color: colors.faint,
  },
  preview: {
    flex: 1,
  },
  faint: {
    color: colors.faint,
  },
  // An outlined button, not a row in the list: it is an action, not a
  // conversation you can open.
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 56,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.track,
  },
  inviteTile: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    color: colors.purple,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.red,
  },
  // Ink, not a colour: the dot already carries the "new" signal, and the
  // preview still has to read as message text.
  unreadText: {
    color: colors.ink,
  },
});

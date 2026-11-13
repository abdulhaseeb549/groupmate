import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { BottomNav, NavTab } from '../components/BottomNav';
import { GlassScene, GlassTarget } from '../components/Glass';
import { FadeIn } from '../components/FadeIn';
import { Icon } from '../components/Icon';
import { InviteModal } from '../components/InviteModal';
import { Member } from '../data/member';
import { Conversation, ConversationSummary, conversationKey } from '../state/messages';
import { useAuth } from '../state/AuthProvider';
import { useChatUnread } from '../state/chatUnread';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, type } from '../theme';
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

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "You: Thanks", "Rohan shared a task", "Ayaan: Survey's in" — who said it, in one line. */
function previewLine(
  summary: ConversationSummary,
  currentUserId: string | undefined,
  membersById: Record<string, Member>,
  isGroup: boolean
): string {
  const sharedTask = summary.preview === 'Shared a task';
  if (summary.lastAuthorId === currentUserId) return sharedTask ? 'You shared a task' : `You: ${summary.preview}`;
  if (!isGroup) return summary.preview;
  const who = firstName(membersById[summary.lastAuthorId]?.name ?? 'Someone');
  return sharedTask ? `${who} shared a task` : `${who}: ${summary.preview}`;
}

/**
 * The Chat tab's landing (board "Chat 1 · Chats"): your team as faces (a
 * mint ring = here now; tap one to message them, + to invite), the team
 * thread on its own card, then the one-to-one threads.
 */
export function ChatListScreen({ activeTab, onSelectTab, onOpenConversation }: Props) {
  const insets = useSafeAreaInsets();
  const { project, members, membersById, onlineUserIds } = useProject();
  const { session } = useAuth();
  const { summaries, isUnread, hasUnread } = useChatUnread();
  const currentUserId = session?.user.id;
  const [inviteOpen, setInviteOpen] = useState(false);
  const now = new Date();

  const others = members.filter((m) => m.id !== currentUserId);

  // The faces: who's here first, then by name.
  const faces = others.slice().sort((a, b) => {
    const aOn = onlineUserIds.has(a.id) ? 0 : 1;
    const bOn = onlineUserIds.has(b.id) ? 0 : 1;
    return aOn - bOn || a.name.localeCompare(b.name);
  });

  // The list: most recently active first, like any chat app. Ties (nobody
  // has messaged yet) fall back to name so the order stays stable.
  const threads = others.slice().sort((a, b) => {
    const aAt = summaries[conversationKey({ type: 'dm', otherUserId: a.id })]?.lastAt ?? '';
    const bAt = summaries[conversationKey({ type: 'dm', otherUserId: b.id })]?.lastAt ?? '';
    if (aAt !== bAt) return bAt.localeCompare(aAt);
    return a.name.localeCompare(b.name);
  });

  const hereNow = others.filter((m) => onlineUserIds.has(m.id)).length;
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
              <Text style={styles.h1} accessibilityRole="header">
                Chats
              </Text>
              <Text style={styles.sub} numberOfLines={1}>
                {project.name}
              </Text>
            </View>
          </FadeIn>

          <FadeIn delay={50}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.facesScroll}
              contentContainerStyle={styles.faces}
            >
              {faces.map((member) => {
                const online = onlineUserIds.has(member.id);
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => onOpenConversation({ type: 'dm', otherUserId: member.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`Message ${member.name}${online ? ', here now' : ''}`}
                    style={({ pressed }) => [styles.faceItem, pressed && styles.pressedLift]}
                  >
                    <View style={[styles.ringSlot, online && styles.ring]}>
                      <Avatar {...member} size={52} />
                    </View>
                    <Text style={[styles.faceName, !online && styles.muted]} numberOfLines={1}>
                      {firstName(member.name)}
                    </Text>
                  </Pressable>
                );
              })}
              {/* The only way anyone else gets into this project, and so into this list. */}
              <Pressable
                onPress={() => setInviteOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Invite teammates"
                style={({ pressed }) => [styles.faceItem, pressed && styles.pressedLift]}
              >
                <View style={styles.ringSlot}>
                  <View style={styles.inviteCircle}>
                    <Icon name="plus" size={20} color={colors.purple} strokeWidth={2} />
                  </View>
                </View>
                <Text style={[styles.faceName, styles.inviteText]}>Invite</Text>
              </Pressable>
            </ScrollView>
          </FadeIn>

          <FadeIn delay={100}>
            <Pressable
              onPress={() => onOpenConversation({ type: 'group' })}
              accessibilityRole="button"
              accessibilityLabel={`Team chat${groupUnread ? ', new messages' : ''}`}
              style={({ pressed }) => [styles.card, styles.teamCard, pressed && styles.pressedLift]}
            >
              <View style={styles.teamTile}>
                <Icon name="users" size={24} color={colors.purple} strokeWidth={1.8} />
              </View>
              <View style={styles.teamText}>
                <View style={styles.topLine}>
                  <Text style={styles.t} numberOfLines={1}>
                    Team chat
                  </Text>
                  <Text style={[styles.time, groupUnread && styles.timeUnread]}>{chatTime(groupSummary?.lastAt, now)}</Text>
                </View>
                <View style={styles.bottomLine}>
                  <Text
                    style={[styles.preview, groupUnread ? styles.previewUnread : groupSummary ? styles.muted : styles.faint]}
                    numberOfLines={1}
                  >
                    {groupSummary ? previewLine(groupSummary, currentUserId, membersById, true) : 'Say hi'}
                  </Text>
                  {groupUnread ? <View style={styles.unreadDot} /> : null}
                </View>
                {others.length > 0 ? (
                  <View style={styles.presenceLine}>
                    <View style={styles.miniFaces}>
                      {others.slice(0, 4).map((m, i) => (
                        <Avatar key={m.id} {...m} size={22} borderColor={colors.surface} style={i > 0 ? styles.miniOverlap : undefined} />
                      ))}
                    </View>
                    <Text style={[styles.presenceText, hereNow === 0 && styles.muted]}>
                      {hereNow > 0 ? `${hereNow} here now` : `${members.length} members`}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          </FadeIn>

          {threads.length > 0 ? (
            <FadeIn delay={150}>
              <View style={styles.section}>
                <Text style={styles.eyebrow}>Direct</Text>
                <View style={[styles.card, styles.list]}>
                  {threads.map((member, i) => {
                    const conversation: Conversation = { type: 'dm', otherUserId: member.id };
                    const summary = summaries[conversationKey(conversation)];
                    const unread = isUnread(conversation);
                    return (
                      <View key={member.id}>
                        {i > 0 ? <View style={styles.hair} /> : null}
                        <Pressable
                          onPress={() => onOpenConversation(conversation)}
                          accessibilityRole="button"
                          accessibilityLabel={`${member.name}${unread ? ', new message' : ''}`}
                          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                        >
                          <View>
                            <Avatar {...member} size={46} />
                            {onlineUserIds.has(member.id) ? <View style={styles.onlineDot} /> : null}
                          </View>
                          <View style={styles.rowText}>
                            <View style={styles.topLine}>
                              <Text style={styles.t} numberOfLines={1}>
                                {member.name}
                              </Text>
                              <Text style={[styles.time, unread && styles.timeUnread]}>{chatTime(summary?.lastAt, now)}</Text>
                            </View>
                            <View style={styles.bottomLine}>
                              <Text
                                style={[styles.preview, unread ? styles.previewUnread : summary ? styles.muted : styles.faint]}
                                numberOfLines={1}
                              >
                                {summary ? previewLine(summary, currentUserId, membersById, false) : 'Say hi'}
                              </Text>
                              {unread ? <View style={styles.unreadDot} /> : null}
                            </View>
                          </View>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            </FadeIn>
          ) : null}
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
    gap: 22,
  },
  header: {
    gap: 4,
  },
  h1: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  sub: {
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  muted: {
    color: colors.muted,
  },
  faint: {
    color: colors.faint,
  },
  pressedLift: {
    transform: [{ scale: 0.97 }],
  },
  // Bleeds to the screen edges so faces scroll past the gutter, not under it.
  facesScroll: {
    marginHorizontal: -layout.screenPadding,
  },
  faces: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: 2,
    gap: 18,
  },
  faceItem: {
    width: 60,
    alignItems: 'center',
    gap: 6,
  },
  // 2px white gap, then a 2px mint ring: here now.
  ringSlot: {
    width: 60,
    height: 60,
    borderRadius: 30,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  ring: {
    borderColor: colors.green,
    backgroundColor: colors.surface,
  },
  faceName: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.ink,
  },
  inviteCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9BEF7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: {
    fontFamily: type.button.fontFamily,
    color: colors.purple,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  teamCard: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  teamTile: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  presenceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  miniFaces: {
    flexDirection: 'row',
  },
  miniOverlap: {
    marginLeft: -7,
  },
  presenceText: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.mintText,
  },
  section: {
    gap: 10,
  },
  eyebrow: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingLeft: 4,
  },
  list: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  // Starts where the text starts (16 padding + 46 avatar + 12 gap).
  hair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 74,
  },
  onlineDot: {
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
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bottomLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  t: {
    flex: 1,
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  time: {
    fontFamily: type.caption.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.faint,
  },
  timeUnread: {
    fontFamily: type.button.fontFamily,
    color: colors.purple,
  },
  preview: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  },
  // Ink and medium: the purple dot already says "new"; the text still has to read as a message.
  previewUnread: {
    fontFamily: type.taskTitle.fontFamily,
    color: colors.ink,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.purple,
  },
});

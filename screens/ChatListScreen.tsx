import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { BottomNav, NavTab } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { Conversation } from '../state/messages';
import { useAuth } from '../state/AuthProvider';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, type } from '../theme';

type Props = {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenConversation: (conversation: Conversation) => void;
};

/**
 * Where the Chat tab actually lands — a WhatsApp-style pick list: the one
 * team-wide group conversation, then a 1:1 row per other member. Tapping
 * either opens ChatScreen scoped to that conversation.
 */
export function ChatListScreen({ activeTab, onSelectTab, onOpenConversation }: Props) {
  const insets = useSafeAreaInsets();
  const { project, members } = useProject();
  const { session } = useAuth();
  const currentUserId = session?.user.id;
  const teammates = members.filter((m) => m.id !== currentUserId);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 40) + 14, paddingBottom: 130 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={type.pageTitle}>Chats</Text>
          <Text style={[type.body, styles.muted]}>{project.name}</Text>
        </View>

        <View style={styles.list}>
          <Pressable
            onPress={() => onOpenConversation({ type: 'group' })}
            accessibilityRole="button"
            accessibilityLabel={`Team chat, ${members.length} members`}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.groupTile}>
              <Icon name="users" size={20} color={colors.purple} strokeWidth={1.8} />
            </View>
            <View style={styles.rowText}>
              <Text style={[type.taskTitle, styles.ink]} numberOfLines={1}>
                Team chat
              </Text>
              <Text style={[type.caption, styles.muted]} numberOfLines={1}>
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </Text>
            </View>
            <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} />
          </Pressable>

          {teammates.map((member) => (
            <Pressable
              key={member.id}
              onPress={() => onOpenConversation({ type: 'dm', otherUserId: member.id })}
              accessibilityRole="button"
              accessibilityLabel={`Direct message with ${member.name}`}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Avatar {...member} size={42} />
              <View style={styles.rowText}>
                <Text style={[type.taskTitle, styles.ink]} numberOfLines={1}>
                  {member.name}
                </Text>
                <Text style={[type.caption, styles.muted]} numberOfLines={1}>
                  Direct message
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} />
            </Pressable>
          ))}

          {teammates.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={[type.caption, styles.muted, styles.centerText]}>
                Invite a teammate to start a direct message with them.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <BottomNav active={activeTab} onSelect={onSelectTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    gap: 20,
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
  centerText: {
    textAlign: 'center',
  },
  list: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 16,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  groupTile: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  emptyBox: {
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
});

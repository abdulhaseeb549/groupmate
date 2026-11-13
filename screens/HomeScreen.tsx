import { useEffect, useMemo, useState } from 'react';
import { Linking, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav, NavTab } from '../components/BottomNav';
import { GlassScene, GlassTarget } from '../components/Glass';
import { Card, CardDivider } from '../components/Card';
import { ActivitySheet } from '../components/ActivitySheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FadeIn } from '../components/FadeIn';
import { Icon } from '../components/Icon';
import { SectionHeader } from '../components/SectionHeader';
import { AttentionRow } from '../components/home/AttentionRow';
import { MiniTile, OnlineFaces, ProjectTile } from '../components/home/BentoTiles';
import { TaskRow } from '../components/home/TaskRow';
import { WeekCard } from '../components/home/WeekCard';
import { weekDates } from '../components/home/WeekStrip';
import { Priority, Task } from '../data/tasks';
import { RequirementState } from '../state/projectState';
import { useAuth } from '../state/AuthProvider';
import { useChatUnread } from '../state/chatUnread';
import { loadLastSeen, markActivitySeen } from '../state/activity';
import { useNavigation } from '../state/NavigationProvider';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, radius, type } from '../theme';
import { checkForUpdate, UpdateCheckResult } from '../utils/checkForUpdate';
import { formatLongDate } from '../utils/dates';

const NEXT_LIMIT = 3;
const ATTENTION_PREVIEW = 2;
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
// Row padding + leading element + gap, so dividers start where the row's text does.
const TASK_DIVIDER_INSET = 16 + layout.checkboxSize + 12;
const ATTENTION_DIVIDER_INSET = 16 + layout.iconTile + 12;

type Props = {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
};

export function HomeScreen({ activeTab, onSelectTab }: Props) {
  const insets = useSafeAreaInsets();
  const { project, tasks, projectState, members, membersById, schedule, setTaskStatus, onlineUserIds } = useProject();
  const { session, profile } = useAuth();
  const { hasUnread, summaries } = useChatUnread();
  const { goToChat, openSettings } = useNavigation();
  const currentUserId = session?.user.id;
  const [showAllAttention, setShowAllAttention] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  // Null until the stored stamp has loaded — before that nothing can be
  // called unseen, or the dot would flash on every cold start.
  const [lastSeen, setLastSeen] = useState<string | null | undefined>(undefined);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const today = useMemo(() => new Date(), []);

  // Falls back to the account email's local part while the profiles row is
  // still loading right after first sign-in.
  const firstName = (profile?.fullName ?? session?.user.email?.split('@')[0] ?? '').split(' ')[0];
  const initials = profile?.initials ?? '··';

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    void loadLastSeen(project.id, currentUserId).then((stamp) => {
      if (!cancelled) setLastSeen(stamp);
    });
    return () => {
      cancelled = true;
    };
  }, [project.id, currentUserId]);

  // The dot used to be painted on unconditionally, under a bell that had
  // no onPress: it announced things had happened and led nowhere. It now
  // means one specific thing — something arrived that this device has not
  // opened the activity list since.
  const newestActivity = Object.values(summaries)
    .filter((summary) => summary.lastAuthorId !== currentUserId)
    .reduce<string>((newest, summary) => (summary.lastAt > newest ? summary.lastAt : newest), '');
  const hasUnseen =
    lastSeen !== undefined && (hasUnread || (newestActivity !== '' && (!lastSeen || newestActivity > lastSeen)));

  function openActivity() {
    setActivityOpen(true);
    if (currentUserId) {
      void markActivitySeen(project.id, currentUserId);
      setLastSeen(new Date().toISOString());
    }
  }

  async function handleCheckForUpdate() {
    if (checkingUpdate) return;
    setCheckingUpdate(true);
    const result = await checkForUpdate();
    setCheckingUpdate(false);
    setUpdateCheck(result);
  }

  const myOpenTasks = tasks
    .filter((t) => t.assigneeId === currentUserId && t.status !== 'completed')
    .sort((a, b) => urgency(a) - urgency(b));
  const nextTasks = myOpenTasks.slice(0, NEXT_LIMIT);

  // One entry per day of this week: how many of your unfinished tasks have
  // to be done by then, from the scheduling engine's latestFinish (the real
  // "last safe day" for a task) rather than an invented per-task deadline.
  const weekCounts = useMemo(() => {
    const days = weekDates(today);
    return days.map(
      (day) =>
        myOpenTasks.filter((t) => {
          const finish = schedule.byTaskId[t.id]?.latestFinish;
          return finish ? finish.toDateString() === day.toDateString() : false;
        }).length
    );
  }, [myOpenTasks, schedule, today]);

  const weekStart = weekDates(today)[0];
  const doneThisWeek = tasks.filter(
    (t) =>
      t.assigneeId === currentUserId &&
      t.status === 'completed' &&
      t.completedAt !== undefined &&
      new Date(t.completedAt) >= weekStart
  ).length;
  const urgentCount = myOpenTasks.filter((t) => t.dueUrgent).length;
  const openHours = myOpenTasks.reduce((sum, t) => sum + (t.effortHours ?? 0), 0);

  // The newest message in any of your conversations, for the chat tile's one live line.
  const latestMessage = Object.values(summaries).reduce<(typeof summaries)[string] | null>(
    (newest, summary) => (!newest || summary.lastAt > newest.lastAt ? summary : newest),
    null
  );
  const latestAuthor = latestMessage
    ? latestMessage.lastAuthorId === currentUserId
      ? 'You'
      : membersById[latestMessage.lastAuthorId]?.name.split(' ')[0]
    : undefined;
  const chatCaption = latestMessage
    ? latestAuthor
      ? `${latestAuthor}: ${latestMessage.preview}`
      : latestMessage.preview
    : 'Say hi to your team';
  const othersOnline = members.filter((m) => m.id !== currentUserId && onlineUserIds.has(m.id)).length;

  const unmet = projectState.requirementStates
    .filter((r) => r.status !== 'met')
    .sort((a, b) => risk(a, currentUserId) - risk(b, currentUserId) || b.blockingTasks.length - a.blockingTasks.length);
  const attention = showAllAttention ? unmet : unmet.slice(0, ATTENTION_PREVIEW);
  const hiddenAttention = unmet.length - ATTENTION_PREVIEW;

  const goToProjects = () => onSelectTab('projects');

  function toggleAttention() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAllAttention((v) => !v);
  }

  function taskContext(task: Task) {
    const requirements = (projectState.blockingRequirementsByTask[task.id] ?? []).map((r) => r.label);
    return [...requirements, task.metadata].filter(Boolean).join(' · ');
  }

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
        <View style={styles.intro}>
          <View style={styles.header}>
            <Pressable
              onPress={openSettings}
              accessibilityRole="button"
              accessibilityLabel="Account settings"
              style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            >
              <Text style={[type.avatarInitials, styles.avatarText]}>{initials}</Text>
            </Pressable>
            <View style={styles.headerText}>
              <Text style={[type.metadata, styles.muted, styles.eyebrow]}>{formatLongDate(today).toUpperCase()}</Text>
              <Text style={[type.greeting, styles.ink]}>Hello, {firstName}</Text>
            </View>
            <Pressable
              onPress={openActivity}
              accessibilityRole="button"
              accessibilityLabel={hasUnseen ? 'Activity, new items' : 'Activity'}
              style={({ pressed }) => [styles.bell, pressed && styles.pressedLift]}
            >
              <Icon name="bell" size={20} color={colors.ink} />
              {hasUnseen ? <View style={styles.bellDot} /> : null}
            </Pressable>
          </View>

          <WeekCard
            today={today}
            counts={weekCounts}
            openCount={myOpenTasks.length}
            doneThisWeek={doneThisWeek}
            urgentCount={urgentCount}
            hours={openHours}
          />
        </View>
        </FadeIn>

        {/* Bento: the project on the left, the two live things about your team on the right. */}
        <FadeIn delay={80}>
          <View style={styles.bento}>
            <ProjectTile
              project={project}
              state={projectState}
              today={today}
              onOpen={goToProjects}
            />
            <View style={styles.bentoColumn}>
              <MiniTile
                lead={
                  <View style={styles.chatTile}>
                    <Icon name="chat" size={18} color={colors.purple} strokeWidth={1.9} />
                  </View>
                }
                badge={
                  hasUnread ? (
                    <View style={styles.newPill}>
                      <Text style={[type.badge, styles.action]}>New</Text>
                    </View>
                  ) : null
                }
                title="Team chat"
                caption={chatCaption}
                accessibilityLabel={`Team chat${hasUnread ? ', new messages' : ''}. ${chatCaption}`}
                onPress={() => goToChat()}
              />
              <MiniTile
                lead={<OnlineFaces members={members} onlineIds={onlineUserIds} />}
                title="Your team"
                caption={
                  othersOnline > 0
                    ? `${othersOnline} online now`
                    : `${members.length} ${members.length === 1 ? 'member' : 'members'}`
                }
                accessibilityLabel={`Your team, ${members.length} members${othersOnline > 0 ? `, ${othersOnline} online now` : ''}`}
                onPress={goToProjects}
              />
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={180}>
        <View style={styles.section}>
          <SectionHeader title="Up next" actionLabel="See all" onAction={goToProjects} />
          <Card>
            {nextTasks.length === 0 ? (
              <View style={styles.emptyRow}>
                <View style={styles.emptyTile}>
                  <Icon name="check" size={18} color={colors.mintText} strokeWidth={2.4} />
                </View>
                <View style={styles.emptyText}>
                  <Text style={[type.taskTitle, styles.ink]}>Nothing on your plate</Text>
                  <Text style={[type.caption, styles.muted]}>New tasks assigned to you will show up here</Text>
                </View>
              </View>
            ) : (
              nextTasks.map((task, i) => (
                <View key={task.id}>
                  {i > 0 ? <CardDivider inset={TASK_DIVIDER_INSET} /> : null}
                  <TaskRow
                    task={task}
                    context={taskContext(task)}
                    onComplete={() => setTaskStatus(task.id, 'completed')}
                  />
                </View>
              ))
            )}
          </Card>
        </View>
        </FadeIn>

        {projectState.health === 'ready' ? (
          <View style={styles.readyBanner}>
            <View style={styles.readyIconTile}>
              <Icon name="check" size={20} color={colors.mintText} strokeWidth={2.6} />
            </View>
            <View style={styles.readyText}>
              <Text style={[type.taskTitle, styles.ink]}>Ready to submit</Text>
              <Text style={[type.caption, styles.muted]}>
                Every requirement is met — {project.name} is good to go.
              </Text>
            </View>
          </View>
        ) : unmet.length > 0 ? (
          <View style={styles.section}>
            <SectionHeader
              title="Needs attention"
              subtitle={`${unmet.length} ${unmet.length === 1 ? 'requirement' : 'requirements'} left before you can submit`}
            />
            <Card>
              {attention.map((state, i) => (
                <View key={state.requirement.id}>
                  {i > 0 ? <CardDivider inset={ATTENTION_DIVIDER_INSET} /> : null}
                  <AttentionRow state={state} currentUserId={currentUserId} onPress={goToProjects} />
                </View>
              ))}
              {hiddenAttention > 0 ? (
                <>
                  <CardDivider />
                  <Pressable
                    onPress={toggleAttention}
                    accessibilityRole="button"
                    aria-expanded={showAllAttention}
                    style={({ pressed }) => [styles.moreRow, pressed && styles.rowPressed]}
                  >
                    <Text style={[type.button, styles.action]}>
                      {showAllAttention ? 'Show less' : `Show ${hiddenAttention} more`}
                    </Text>
                    <Icon
                      name={showAllAttention ? 'chevronUp' : 'chevronDown'}
                      size={16}
                      color={colors.purple}
                      strokeWidth={2}
                    />
                  </Pressable>
                </>
              ) : null}
            </Card>
          </View>
        ) : null}

        {/* Moved out of the header, where it sat between the greeting and the date. */}
        <Pressable
          onPress={handleCheckForUpdate}
          disabled={checkingUpdate}
          accessibilityRole="button"
          style={({ pressed }) => [styles.updateRow, pressed && styles.pressed]}
        >
          <Icon name="download" size={15} color={colors.muted} strokeWidth={1.9} />
          <Text style={[type.caption, styles.muted]}>{checkingUpdate ? 'Checking…' : 'Check for app update'}</Text>
        </Pressable>
      </ScrollView>
      </GlassTarget>

      <BottomNav active={activeTab} onSelect={onSelectTab} chatUnread={hasUnread} />

      <ActivitySheet
        visible={activityOpen}
        onClose={() => setActivityOpen(false)}
        onOpenConversation={goToChat}
      />

      <ConfirmDialog
        visible={updateCheck !== null}
        title={
          updateCheck?.status === 'update_available'
            ? 'Update available'
            : updateCheck?.status === 'up_to_date'
              ? "You're up to date"
              : "Couldn't check"
        }
        message={
          updateCheck?.status === 'update_available'
            ? `Build ${updateCheck.latestBuild} is ready — you have build ${updateCheck.currentBuild}.`
            : updateCheck?.status === 'up_to_date'
              ? `You already have the latest build (${updateCheck.currentBuild}).`
              : updateCheck?.status === 'unknown'
                ? updateCheck.message
                : undefined
        }
        confirmLabel={updateCheck?.status === 'update_available' ? 'Update now' : 'OK'}
        cancelLabel={updateCheck?.status === 'update_available' ? 'Later' : 'Close'}
        onConfirm={() => {
          if (updateCheck?.status === 'update_available') {
            void Linking.openURL(updateCheck.downloadUrl);
          }
          setUpdateCheck(null);
        }}
        onCancel={() => setUpdateCheck(null)}
      />
    </GlassScene>
  );
}

// Anything due today first, then anything with a deadline, then by priority.
function urgency(task: Task) {
  return (task.dueUrgent ? 0 : task.dueLabel ? 3 : 6) + PRIORITY_RANK[task.priority];
}

// Untouched requirements before half-done ones, and your own before anyone else's.
function risk(state: RequirementState, currentUserId: string | undefined) {
  const onYou = state.blockingTasks.some((t) => t.assigneeId === currentUserId);
  return (state.status === 'not_started' ? 0 : 2) + (onYou ? 0 : 1);
}

const styles = StyleSheet.create({
  // Shadowed views shrink when pressed instead of fading: a faded view shows
  // its Android shadow through it as a grey box.
  pressedLift: {
    transform: [{ scale: 0.97 }],
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    gap: layout.sectionGap,
  },
  // Small, because the week card's mascot already rises into this space.
  intro: {
    gap: layout.sectionGap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: layout.avatarHeader,
    height: layout.avatarHeader,
    borderRadius: layout.avatarHeader / 2,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.purple,
    fontSize: 15,
    lineHeight: 20,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    letterSpacing: 0.6,
  },
  bento: {
    flexDirection: 'row',
    gap: 12,
    minHeight: 236,
  },
  bentoColumn: {
    flex: 1,
    gap: 12,
  },
  chatTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newPill: {
    minHeight: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: colors.purpleSoft,
    justifyContent: 'center',
  },
  updateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  action: {
    color: colors.purple,
  },
  pressed: {
    opacity: 0.6,
  },
  bell: {
    width: layout.avatarHeader,
    height: layout.avatarHeader,
    borderRadius: layout.avatarHeader / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.red,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  section: {
    gap: 12,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 48,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  emptyTile: {
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: layout.iconTileRadius,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    flex: 1,
    gap: 2,
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.mint,
    borderRadius: radius.card,
    padding: 16,
  },
  readyIconTile: {
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: layout.iconTileRadius,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyText: {
    flex: 1,
    gap: 2,
  },
});

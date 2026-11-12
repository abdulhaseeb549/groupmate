import { useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { BottomNav, NavTab } from '../components/BottomNav';
import { GlassButton, GlassScene, GlassTarget } from '../components/Glass';
import { CapacityModal } from '../components/CapacityModal';
import { Card } from '../components/Card';
import { DistributionEditor } from '../components/DistributionEditor';
import { DueDateModal } from '../components/DueDateModal';
import { FadeIn } from '../components/FadeIn';
import { Icon } from '../components/Icon';
import { ProjectTimeline } from '../components/projects/ProjectTimeline';
import { RebalanceSuggestions } from '../components/RebalanceSuggestions';
import { RequirementEditDialog } from '../components/RequirementEditDialog';
import { Requirement } from '../data/requirements';
import { ProjectHealth, RequirementStatus } from '../state/projectState';
import { ProjectSwitcher } from '../components/ProjectSwitcher';
import { useAuth } from '../state/AuthProvider';
import { useChatUnread } from '../state/chatUnread';
import { notifyNudge } from '../state/pushNotifications';
import { useProject } from '../state/ProjectRepository';
import { colors, gradients, layout, radius, spacing, type } from '../theme';
import { formatDueDate } from '../utils/dates';

const REQUIREMENT_STATUS: Record<RequirementStatus, { label: string; bg: string; text: string }> = {
  not_started: { label: 'Not started', bg: colors.surfaceMuted, text: colors.muted },
  in_progress: { label: 'In progress', bg: colors.yellowSoft, text: colors.yellowText },
  met: { label: 'Met', bg: colors.mint, text: colors.mintText },
};

type Props = {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
};

const FILTERS = ['My tasks', 'All'] as const;
const SECTIONS = ['Timeline', 'Requirements', 'Workload', 'Tasks'] as const;
type Section = (typeof SECTIONS)[number];

const HEALTH: Record<ProjectHealth, { label: string; bg: string; dot: string; text: string }> = {
  on_track: { label: 'On track', bg: colors.mint, dot: colors.green, text: colors.mintText },
  at_risk: { label: 'At risk', bg: colors.yellowSoft, dot: colors.amber, text: colors.yellowText },
  ready: { label: 'Ready to submit', bg: colors.mint, dot: colors.green, text: colors.mintText },
};

export function ProjectsScreen({ activeTab, onSelectTab }: Props) {
  const insets = useSafeAreaInsets();
  const { project, tasks, projectState, schedule, members, projects } = useProject();
  const { session, profile } = useAuth();
  const { hasUnread } = useChatUnread();
  const currentUserId = session?.user.id;
  const [filter, setFilterState] = useState<(typeof FILTERS)[number]>('My tasks');
  const [capacityVisible, setCapacityVisible] = useState(false);
  const [switcherVisible, setSwitcherVisible] = useState(false);
  const [dueDateVisible, setDueDateVisible] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<Requirement | null>(null);
  const [section, setSectionState] = useState<Section>('Timeline');
  // Session-only — a nudge is a nudge, not a queue; once sent this view
  // shows it as sent rather than letting the same tap fire again.
  const [nudgedIds, setNudgedIds] = useState<Set<string>>(new Set());

  function handleNudge(memberId: string) {
    if (nudgedIds.has(memberId)) return;
    setNudgedIds((prev) => new Set(prev).add(memberId));
    notifyNudge(memberId, profile?.fullName ?? 'Someone', project.name, project.id);
  }

  function setSection(next: Section) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSectionState(next);
  }

  function setFilter(next: (typeof FILTERS)[number]) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFilterState(next);
  }
  const filteredMemberIds =
    filter === 'My tasks' ? (currentUserId ? [currentUserId] : []) : members.map((m) => m.id);
  const today = useMemo(() => new Date(), []);

  const health = HEALTH[projectState.health];
  const percent = Math.round(projectState.taskProgress.pct * 100);
  const daysLabel = daysRemainingLabel(projectState.daysRemaining, projectState.health);

  const workload = members.map((member) => {
    const memberTasks = tasks.filter((t) => t.assigneeId === member.id);
    const done = memberTasks.filter((t) => t.status === 'completed').length;
    return { member, done, total: memberTasks.length };
  });

  return (
    <GlassScene style={styles.screen}>
      <GlassTarget>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 40) + 14, paddingBottom: 130 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[type.metadata, styles.eyebrow]} numberOfLines={1}>
              {[project.course, project.team].filter(Boolean).join(' · ').toUpperCase()}
            </Text>
            <Pressable
              onPress={() => setSwitcherVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`${project.name}, switch project`}
              style={({ pressed }) => [styles.titleRow, pressed && styles.titlePressed]}
            >
              <Text style={[type.pageTitle, styles.titleText]} numberOfLines={2}>
                {project.name}
              </Text>
              {projects.length > 1 ? (
                <View style={styles.switchChip}>
                  <Icon name="chevronDown" size={16} color={colors.muted} strokeWidth={2.2} />
                </View>
              ) : null}
            </Pressable>
          </View>
          <GlassButton label="Change due date" onPress={() => setDueDateVisible(true)} style={styles.editButton}>
            <Icon name="edit" size={19} color={colors.ink} strokeWidth={1.8} />
          </GlassButton>
        </View>
        </FadeIn>

        <FadeIn delay={60}>
        <View style={styles.shadow}>
          <View style={styles.statusCard}>
            <LinearGradient
              colors={[colors.purpleSoft, colors.surface]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.35, y: 0.8 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.statusTop}>
              <View
                style={styles.bigNumberRow}
                accessible
                accessibilityLabel={`${percent} percent done`}
              >
                <Text style={styles.bigNumber}>{percent}%</Text>
                <Text style={[type.subtitle, { color: colors.muted }]}>done</Text>
              </View>
              <View style={styles.statusSide}>
                <View style={[styles.healthPill, { backgroundColor: health.bg }]}>
                  <View style={[styles.healthDot, { backgroundColor: health.dot }]} />
                  <Text style={[type.badge, { color: health.text }]} numberOfLines={1}>
                    {health.label}
                  </Text>
                </View>
                <Text style={[type.caption, { color: colors.muted }]}>{daysLabel}</Text>
              </View>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${percent}%` }]} />
            </View>
            <View style={styles.stats}>
              <View style={[styles.stat, styles.statWide]}>
                <Text style={styles.statNumber}>
                  {projectState.requirementProgress.met}
                  <Text style={styles.statTotal}>/{projectState.requirementProgress.total}</Text>
                </Text>
                <Text style={styles.statLabel}>Requirements</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <Text style={styles.statNumber}>
                  {projectState.taskProgress.done}
                  <Text style={styles.statTotal}>/{projectState.taskProgress.total}</Text>
                </Text>
                <Text style={styles.statLabel}>Tasks</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.stat}>
                <View style={styles.faces}>
                  {members.slice(0, 3).map((m, i) => (
                    <Avatar
                      key={m.id}
                      initials={m.initials}
                      bg={m.bg}
                      fg={m.fg}
                      size={30}
                      borderColor={colors.surface}
                      style={i > 0 ? { marginLeft: -8 } : undefined}
                    />
                  ))}
                </View>
                <Text style={styles.statLabel}>
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </Text>
              </View>
            </View>
          </View>
        </View>
        </FadeIn>

        {schedule.projectAtRisk ? (
          <View style={styles.scheduleWarning}>
            <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
            <Text style={[type.caption, styles.scheduleWarningText]}>
              At this pace the work won't finish by the due date. The Timeline shows what's furthest behind.
            </Text>
          </View>
        ) : null}

        <View accessibilityRole="tablist" style={styles.segs}>
          {SECTIONS.map((sec) => {
            const active = sec === section;
            return (
              <Pressable
                key={sec}
                onPress={() => setSection(sec)}
                accessibilityRole="tab"
                aria-selected={active}
                style={[styles.seg, active && styles.segActive]}
              >
                <Text numberOfLines={1} style={[styles.segText, { color: active ? colors.ink : colors.muted }]}>
                  {sec}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <FadeIn key={section}>
        {section === 'Timeline' ? (
          <View style={styles.section}>
            <ProjectTimeline
              tasks={tasks}
              schedule={schedule}
              dueDate={project.dueDate}
              today={today}
              nudgedIds={nudgedIds}
              onNudge={handleNudge}
            />
          </View>
        ) : null}

        {section === 'Requirements' ? (
          <View style={styles.section}>
            <Card>
              {projectState.requirementStates.map((state, i) => {
                const requirementStatus = REQUIREMENT_STATUS[state.status];
                return (
                  <Pressable
                    key={state.requirement.id}
                    onPress={() => setEditingRequirement(state.requirement)}
                    style={[styles.requirementRow, i > 0 && styles.requirementRowDivider]}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit ${state.requirement.label}`}
                  >
                    <Text style={[type.body, styles.requirementLabel]} numberOfLines={2}>
                      {state.requirement.label}
                    </Text>
                    <View style={[styles.requirementPill, { backgroundColor: requirementStatus.bg }]}>
                      <Text style={[type.badge, { color: requirementStatus.text }]}>{requirementStatus.label}</Text>
                    </View>
                    <Icon name="edit" size={14} color={colors.faint} strokeWidth={1.8} />
                  </Pressable>
                );
              })}
            </Card>
          </View>
        ) : null}

        {section === 'Workload' ? (
          <View style={styles.section}>
            <Pressable
              onPress={() => setCapacityVisible(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Edit hours per day"
              style={styles.editHoursRow}
            >
              <Text style={[type.button, styles.editHoursLink]}>Edit hours</Text>
            </Pressable>
            <Card>
              {workload.map((w) => {
                const pct = w.total > 0 ? w.done / w.total : 0;
                return (
                  <View key={w.member.id} style={styles.workloadRow}>
                    <View style={styles.workloadHeader}>
                      <Avatar initials={w.member.initials} bg={w.member.bg} fg={w.member.fg} size={28} />
                      <Text style={[type.taskTitle, styles.workloadName]} numberOfLines={1}>
                        {w.member.name}
                      </Text>
                      <Text style={[type.metadata, { color: colors.muted }]}>
                        {w.done}/{w.total}
                      </Text>
                      {w.member.id !== currentUserId ? (
                        <Pressable
                          onPress={() => handleNudge(w.member.id)}
                          disabled={nudgedIds.has(w.member.id)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={
                            nudgedIds.has(w.member.id) ? `Nudged ${w.member.name}` : `Nudge ${w.member.name}`
                          }
                          style={({ pressed }) => [
                            styles.nudgeButton,
                            nudgedIds.has(w.member.id) && styles.nudgeButtonSent,
                            pressed && !nudgedIds.has(w.member.id) && styles.nudgeButtonPressed,
                          ]}
                        >
                          <Icon
                            name={nudgedIds.has(w.member.id) ? 'check' : 'bell'}
                            size={12}
                            color={nudgedIds.has(w.member.id) ? colors.mintText : colors.purple}
                            strokeWidth={2.2}
                          />
                          <Text
                            style={[type.tinyLabel, nudgedIds.has(w.member.id) ? styles.nudgeTextSent : styles.nudgeText]}
                          >
                            {nudgedIds.has(w.member.id) ? 'Nudged' : 'Nudge'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.workloadTrack}>
                      <LinearGradient
                        colors={gradients.purpleDeep}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.workloadFill, { width: `${Math.round(pct * 100)}%` }]}
                      />
                    </View>
                  </View>
                );
              })}
            </Card>
            <RebalanceSuggestions today={today} />
          </View>
        ) : null}

        {section === 'Tasks' ? (
          <View style={styles.section}>
            <View style={styles.segs}>
              {FILTERS.map((f) => {
                const active = f === filter;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFilter(f)}
                    accessibilityRole="button"
                    aria-selected={active}
                    style={[styles.seg, active && styles.segActive]}
                  >
                    <Text style={[styles.segText, { color: active ? colors.ink : colors.muted }]}>{f}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[type.caption, { color: colors.muted }]}>Tap a task to start, finish or reassign it.</Text>
            <View style={styles.card}>
              <DistributionEditor members={filteredMemberIds} includeUnclaimed={filter !== 'My tasks'} />
            </View>
          </View>
        ) : null}
        </FadeIn>
      </ScrollView>
      </GlassTarget>

      <BottomNav active={activeTab} onSelect={onSelectTab} chatUnread={hasUnread} />

      <ProjectSwitcher visible={switcherVisible} onClose={() => setSwitcherVisible(false)} />
      <CapacityModal visible={capacityVisible} onClose={() => setCapacityVisible(false)} />
      <DueDateModal visible={dueDateVisible} onClose={() => setDueDateVisible(false)} />
      <RequirementEditDialog requirement={editingRequirement} onClose={() => setEditingRequirement(null)} />
    </GlassScene>
  );
}

// "All requirements met" once ready — a days count stops mattering at that point.
function daysRemainingLabel(daysRemaining: number, health: ProjectHealth): string {
  if (health === 'ready') return 'All requirements met';
  if (daysRemaining === 0) return 'Due today';
  if (daysRemaining > 0) return `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left`;
  const overdue = Math.abs(daysRemaining);
  return `${overdue} ${overdue === 1 ? 'day' : 'days'} overdue`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPadding,
    gap: layout.sectionGap,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // Keeps the tap target a comfortable height without shifting the
    // title off the screen padding.
    paddingVertical: 4,
    marginVertical: -4,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  titleText: {
    flexShrink: 1,
    // Keeps the switch chip beside the last word rather than at the far edge.
    flexGrow: 0,
    color: colors.ink,
  },
  switchChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titlePressed: {
    opacity: 0.6,
  },
  eyebrow: {
    color: colors.muted,
    letterSpacing: 0.6,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  editButton: {
    marginTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  section: {
    gap: 12,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  requirementRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  requirementLabel: {
    flex: 1,
    color: colors.ink,
  },
  requirementPill: {
    height: layout.pillHeight,
    paddingHorizontal: 10,
    borderRadius: layout.pillRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Four views in one quiet track; the open one is a raised white chip.
  segs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(21,21,26,0.05)',
  },
  // Sized by their words, then shared out evenly, so no label is ever clipped.
  seg: {
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    height: 36,
    borderRadius: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segText: {
    fontFamily: type.button.fontFamily,
    fontSize: 13,
    lineHeight: 18,
  },
  segActive: {
    backgroundColor: colors.surface,
    shadowColor: '#1C1633',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  editHoursRow: {
    alignSelf: 'flex-end',
  },
  editHoursLink: {
    color: colors.purple,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 16,
  },
  shadow: {
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    shadowColor: '#1C1633',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  statusCard: {
    borderRadius: radius.card,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
    padding: 20,
    gap: 16,
  },
  bigNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  bigNumber: {
    fontFamily: 'CabinetGrotesk-Extrabold',
    fontSize: 56,
    lineHeight: 58,
    letterSpacing: -2,
    color: colors.ink,
  },
  statusSide: {
    alignItems: 'flex-end',
    gap: 6,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stat: {
    flex: 1,
    gap: 4,
  },
  statWide: {
    flex: 1.35,
  },
  statLabel: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  statNumber: {
    fontFamily: type.statNumber.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: colors.ink,
  },
  statTotal: {
    fontFamily: type.body.fontFamily,
    fontSize: 14,
    color: colors.muted,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  faces: {
    flexDirection: 'row',
    height: 30,
    alignItems: 'center',
  },
  scheduleWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.redSoft,
    borderRadius: 16,
    padding: 14,
  },
  scheduleWarningText: {
    flex: 1,
    color: colors.redText,
  },
  statusTop: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  healthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // minHeight + padding rather than a fixed height, and no shrinking: at a
    // large system font scale "On track" was wrapping to a second line and
    // getting clipped by the fixed 24px box.
    minHeight: layout.pillHeight,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: layout.pillRadius,
    flexShrink: 0,
  },
  healthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.purple,
  },
  workloadRow: {
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  workloadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  workloadName: {
    flex: 1,
    color: colors.ink,
  },
  workloadTrack: {
    // 28 (avatar) + 10 (header gap) — the bar's left edge lines up with the name's, not the avatar's.
    marginLeft: 38,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  workloadFill: {
    height: '100%',
    borderRadius: 3,
  },
  nudgeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: 13,
    backgroundColor: colors.purpleSoft,
  },
  nudgeButtonPressed: {
    opacity: 0.7,
  },
  nudgeButtonSent: {
    backgroundColor: colors.mint,
  },
  nudgeText: {
    color: colors.purple,
  },
  nudgeTextSent: {
    color: colors.mintText,
  },
});

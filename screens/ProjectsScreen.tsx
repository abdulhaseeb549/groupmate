import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { BottomNav, NavTab } from '../components/BottomNav';
import { CapacityModal } from '../components/CapacityModal';
import { Card } from '../components/Card';
import { DistributionEditor } from '../components/DistributionEditor';
import { DueDateModal } from '../components/DueDateModal';
import { Icon } from '../components/Icon';
import { ProjectTimeline } from '../components/projects/ProjectTimeline';
import { RebalanceSuggestions } from '../components/RebalanceSuggestions';
import { RequirementEditDialog } from '../components/RequirementEditDialog';
import { Requirement } from '../data/requirements';
import { ProjectHealth, RequirementStatus } from '../state/projectState';
import { useAuth } from '../state/AuthProvider';
import { useChatUnread } from '../state/chatUnread';
import { useProject } from '../state/ProjectRepository';
import { colors, gradients, layout, spacing, type } from '../theme';
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
  const { project, tasks, projectState, schedule, members } = useProject();
  const { session } = useAuth();
  const { hasUnread } = useChatUnread();
  const currentUserId = session?.user.id;
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('My tasks');
  const [capacityVisible, setCapacityVisible] = useState(false);
  const [dueDateVisible, setDueDateVisible] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<Requirement | null>(null);
  const [section, setSection] = useState<Section>('Timeline');
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
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: Math.max(insets.top, 40) + 14, paddingBottom: 130 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={type.pageTitle}>{project.name}</Text>
          <View style={styles.dueRow}>
            <Text style={[type.body, { color: colors.muted }]}>
              {project.team} · Due {formatDueDate(project.dueDate, today)}
            </Text>
            <Pressable
              onPress={() => setDueDateVisible(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Change due date"
            >
              <Text style={[type.button, styles.editHoursLink]}>Edit</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View style={[styles.healthPill, { backgroundColor: health.bg }]}>
              <View style={[styles.healthDot, { backgroundColor: health.dot }]} />
              <Text style={[type.badge, { color: health.text }]} numberOfLines={1}>
                {health.label}
              </Text>
            </View>
            <Text style={[type.caption, { color: colors.muted }]}>{daysLabel}</Text>
          </View>
          <View style={styles.progressRow}>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${percent}%` }]} />
            </View>
            <Text style={[type.button, { color: colors.ink }]}>{percent}%</Text>
          </View>
          <Text style={[type.caption, { color: colors.muted }]}>
            {projectState.requirementProgress.met} of {projectState.requirementProgress.total} requirements met ·{' '}
            {projectState.taskProgress.done} of {projectState.taskProgress.total} tasks done
          </Text>
        </View>

        {schedule.projectAtRisk ? (
          <View style={styles.scheduleWarning}>
            <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
            <Text style={[type.caption, styles.scheduleWarningText]}>
              At current pace, the work still in progress won't finish by the due date — check the Timeline below for
              what's furthest behind.
            </Text>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {SECTIONS.map((s) => {
            const active = s === section;
            return (
              <Pressable
                key={s}
                onPress={() => setSection(s)}
                accessibilityRole="tab"
                aria-selected={active}
                style={[styles.tabPill, active && styles.tabPillActive]}
              >
                <Text style={[type.button, { color: active ? colors.onInk : colors.muted }]}>{s}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {section === 'Timeline' ? (
          <View style={styles.section}>
            <ProjectTimeline tasks={tasks} schedule={schedule} dueDate={project.dueDate} today={today} />
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
            <View style={styles.filterRow}>
              {FILTERS.map((f) => {
                const active = f === filter;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFilter(f)}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                  >
                    <Text style={[type.button, { color: active ? colors.onInk : colors.muted }]}>
                      {f}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[type.body, { color: colors.muted }]}>
              Tap a task to start it, finish it, or reassign it. Changes here apply to the whole project.
            </Text>
            <View style={styles.card}>
              <DistributionEditor members={filteredMemberIds} includeUnclaimed={filter !== 'My tasks'} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <BottomNav active={activeTab} onSelect={onSelectTab} chatUnread={hasUnread} />

      <CapacityModal visible={capacityVisible} onClose={() => setCapacityVisible(false)} />
      <DueDateModal visible={dueDateVisible} onClose={() => setDueDateVisible(false)} />
      <RequirementEditDialog requirement={editingRequirement} onClose={() => setEditingRequirement(null)} />
    </View>
  );
}

// "All requirements met" once ready — a days count stops mattering at that point.
function daysRemainingLabel(daysRemaining: number, health: ProjectHealth): string {
  if (health === 'ready') return 'All requirements met';
  if (daysRemaining === 0) return 'Due today';
  if (daysRemaining > 0) return `Due in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}`;
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
    gap: spacing.xl,
  },
  header: {
    gap: 4,
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  tabPill: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabPillActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  editHoursRow: {
    alignSelf: 'flex-end',
  },
  editHoursLink: {
    color: colors.purple,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterPill: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 16,
  },
  statusCard: {
    backgroundColor: colors.purpleSoft,
    borderRadius: 20,
    padding: 16,
    gap: 12,
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
    alignItems: 'center',
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
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  track: {
    flex: 1,
    height: layout.progressBarHeight,
    borderRadius: layout.progressBarHeight / 2,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: layout.progressBarHeight / 2,
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
});

import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { BottomNav, NavTab } from '../components/BottomNav';
import { Card, CardDivider } from '../components/Card';
import { DistributionEditor } from '../components/DistributionEditor';
import { ProjectTimeline } from '../components/projects/ProjectTimeline';
import { CURRENT_USER_ID, TEAM, TEAM_ORDER } from '../data/team';
import { ProjectHealth } from '../state/projectState';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, spacing, type } from '../theme';
import { formatDueDate } from '../utils/dates';

type Props = {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
};

const FILTERS = ['My tasks', 'All'] as const;

const HEALTH: Record<ProjectHealth, { label: string; bg: string; dot: string; text: string }> = {
  on_track: { label: 'On track', bg: colors.mint, dot: colors.green, text: colors.mintText },
  at_risk: { label: 'At risk', bg: colors.yellowSoft, dot: colors.amber, text: colors.yellowText },
  ready: { label: 'Ready to submit', bg: colors.mint, dot: colors.green, text: colors.mintText },
};

export function ProjectsScreen({ activeTab, onSelectTab }: Props) {
  const insets = useSafeAreaInsets();
  const { project, tasks, projectState } = useProject();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('My tasks');
  const members = filter === 'My tasks' ? [CURRENT_USER_ID] : TEAM_ORDER;
  const today = useMemo(() => new Date(), []);

  const health = HEALTH[projectState.health];
  const percent = Math.round(projectState.taskProgress.pct * 100);
  const daysLabel = daysRemainingLabel(projectState.daysRemaining, projectState.health);

  const workload = TEAM_ORDER.map((id) => {
    const memberTasks = tasks.filter((t) => t.assigneeId === id);
    const done = memberTasks.filter((t) => t.done).length;
    return { member: TEAM[id], done, total: memberTasks.length };
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
          <Text style={[type.body, { color: colors.muted }]}>
            {project.team} · Due {formatDueDate(project.dueDate, today)}
          </Text>
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusTop}>
            <View style={[styles.healthPill, { backgroundColor: health.bg }]}>
              <View style={[styles.healthDot, { backgroundColor: health.dot }]} />
              <Text style={[type.badge, { color: health.text }]}>{health.label}</Text>
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

        <View style={styles.section}>
          <Text style={type.sectionHeading}>Timeline</Text>
          <ProjectTimeline
            requirementStates={projectState.requirementStates}
            dueDate={project.dueDate}
            today={today}
          />
        </View>

        <View style={styles.section}>
          <Text style={type.sectionHeading}>Workload</Text>
          <Card>
            {workload.map((w, i) => {
              const pct = w.total > 0 ? w.done / w.total : 0;
              return (
                <View key={w.member.id}>
                  {i > 0 ? <CardDivider inset={16} /> : null}
                  <View style={styles.workloadRow}>
                    <View style={styles.workloadHeader}>
                      <Avatar initials={w.member.initials} bg={w.member.bg} fg={w.member.fg} size={28} />
                      <Text style={[type.body, styles.workloadName]} numberOfLines={1}>
                        {w.member.name}
                      </Text>
                      <Text style={[type.metadata, { color: colors.muted }]}>
                        {w.done}/{w.total}
                      </Text>
                    </View>
                    <View style={styles.workloadTrack}>
                      <View style={[styles.workloadFill, { width: `${Math.round(pct * 100)}%` }]} />
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={type.sectionHeading}>Tasks</Text>
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
            Tap a task to move it to someone else. Changes here apply to the whole project.
          </Text>
          <View style={styles.card}>
            <DistributionEditor members={members} />
          </View>
        </View>
      </ScrollView>

      <BottomNav active={activeTab} onSelect={onSelectTab} />
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
  section: {
    gap: 12,
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
    height: layout.pillHeight,
    paddingHorizontal: 10,
    borderRadius: layout.pillRadius,
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
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceMuted,
    overflow: 'hidden',
  },
  workloadFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.purple,
  },
});

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { Icon } from './Icon';
import { TEAM } from '../data/team';
import { useProject } from '../state/ProjectRepository';
import { generateRebalanceSuggestions, RebalanceSuggestion } from '../state/rebalancing';
import { colors, type } from '../theme';

type Props = {
  today: Date;
};

function pct(loadPct: number): string {
  return `${Math.round(loadPct * 100)}%`;
}

function formatEffort(hours: number): string {
  return `${Number(hours.toFixed(1))}h`;
}

/**
 * Only ever shows a move that generateRebalanceSuggestions has already
 * validated by re-running the real scheduler — never a "pick whoever's
 * least busy" guess. Dismiss just hides a card for this session; Accept
 * calls the same reassignTask everything else uses, so Workload/Timeline
 * recompute on their own.
 */
export function RebalanceSuggestions({ today }: Props) {
  const { tasks, taskDependencies, project, reassignTask } = useProject();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const suggestions = useMemo(
    () => generateRebalanceSuggestions(tasks, taskDependencies, project.memberHoursPerDay, project.dueDate, today),
    [tasks, taskDependencies, project, today]
  );

  const visible = suggestions.filter((s) => !dismissed.has(s.taskId));
  if (visible.length === 0) return null;

  function dismiss(taskId: string) {
    setDismissed((prev) => new Set(prev).add(taskId));
    setExpandedId((current) => (current === taskId ? null : current));
  }

  function accept(s: RebalanceSuggestion) {
    reassignTask(s.taskId, s.toMember);
    setExpandedId(null);
  }

  return (
    <View style={styles.section}>
      <Text style={type.sectionHeading}>Balancing suggestions</Text>
      <View style={styles.list}>
        {visible.map((s) => {
          const from = TEAM[s.fromMember];
          const to = TEAM[s.toMember];
          const expanded = expandedId === s.taskId;
          return (
            <Card key={s.taskId}>
              <View style={styles.card}>
                <View style={styles.titleRow}>
                  <Text style={[type.taskTitle, styles.title]} numberOfLines={2}>
                    {s.taskTitle}
                  </Text>
                  <View style={styles.effortPill}>
                    <Text style={[type.metadata, { color: colors.muted }]}>{formatEffort(s.effortHours)}</Text>
                  </View>
                </View>

                <View style={styles.moveRow}>
                  <View style={styles.person}>
                    <Avatar {...from} size={30} />
                    <Text style={[type.caption, styles.personName]} numberOfLines={1}>
                      {from.name}
                    </Text>
                  </View>
                  <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} />
                  <View style={styles.person}>
                    <Avatar {...to} size={30} />
                    <Text style={[type.caption, styles.personName]} numberOfLines={1}>
                      {to.name}
                    </Text>
                  </View>
                </View>

                <Text style={[type.caption, styles.reason]}>{s.reason}</Text>

                <View style={styles.impactRow}>
                  <Text style={[type.statLabel, styles.impactText]}>
                    {from.name} {pct(s.before.from)} → {pct(s.after.from)}
                  </Text>
                  <Text style={[type.statLabel, styles.impactText]}>
                    {to.name} {pct(s.before.to)} → {pct(s.after.to)}
                  </Text>
                </View>

                {expanded ? (
                  <View style={styles.detail}>
                    <Text style={[type.caption, styles.detailText]}>
                      {s.projectRiskAfter
                        ? "The project stays at risk either way — this move alone doesn't fix that."
                        : s.projectRiskBefore
                          ? 'This also brings the project back on track.'
                          : 'The project stays on track either way.'}
                    </Text>
                    <Pressable
                      onPress={() => accept(s)}
                      style={styles.acceptButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Reassign ${s.taskTitle} from ${from.name} to ${to.name}`}
                    >
                      <Text style={[type.button, { color: colors.onInk }]}>Accept and reassign</Text>
                    </Pressable>
                  </View>
                ) : null}

                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => setExpandedId(expanded ? null : s.taskId)}
                    style={styles.actionButton}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={[type.button, { color: colors.purple }]}>{expanded ? 'Hide' : 'Review'}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => dismiss(s.taskId)}
                    style={styles.actionButton}
                    hitSlop={8}
                    accessibilityRole="button"
                  >
                    <Text style={[type.button, { color: colors.muted }]}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
  },
  list: {
    gap: 12,
  },
  card: {
    padding: 16,
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    flex: 1,
    color: colors.ink,
  },
  effortPill: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  person: {
    alignItems: 'center',
    gap: 4,
    width: 64,
  },
  personName: {
    color: colors.muted,
  },
  reason: {
    color: colors.muted,
  },
  impactRow: {
    flexDirection: 'row',
    gap: 16,
  },
  impactText: {
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  detail: {
    gap: 10,
    paddingTop: 2,
  },
  detailText: {
    color: colors.muted,
  },
  acceptButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 24,
    paddingTop: 2,
  },
  actionButton: {
    paddingVertical: 12,
    justifyContent: 'center',
  },
});

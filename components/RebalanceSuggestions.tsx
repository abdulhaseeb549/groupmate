import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { TEAM } from '../data/team';
import { useProject } from '../state/ProjectRepository';
import { generateRebalanceSuggestions, RebalanceImpact, RebalanceSuggestion } from '../state/rebalancing';
import { colors, type } from '../theme';

type Props = {
  today: Date;
};

const IMPACT: Record<RebalanceImpact, { label: string; bg: string; text: string }> = {
  high: { label: 'High impact', bg: colors.mint, text: colors.mintText },
  medium: { label: 'Medium impact', bg: colors.yellowSoft, text: colors.yellowText },
  low: { label: 'Low impact', bg: colors.surfaceMuted, text: colors.muted },
};

function pct(loadPct: number): string {
  return `${Math.round(loadPct * 100)}%`;
}

function hours(n: number): string {
  return Number(n.toFixed(1)).toString();
}

function barColor(afterPct: number): string {
  if (afterPct > 1) return colors.red;
  if (afterPct >= 0.8) return colors.amber;
  return colors.green;
}

function riskLine(s: RebalanceSuggestion): string | null {
  if (s.projectRiskAfter) {
    return "Project remains at risk after this move — it doesn't remove the deadline risk on its own.";
  }
  if (s.projectRiskBefore) {
    return 'This also brings the project back on track.';
  }
  return null;
}

/**
 * Only ever shows a move that generateRebalanceSuggestions has already
 * validated by re-running the real scheduler — never a "pick whoever's
 * least busy" guess. Accept calls the same reassignTask everything else
 * uses, so Workload/Timeline recompute on their own; Dismiss just hides a
 * card for this session.
 */
export function RebalanceSuggestions({ today }: Props) {
  const { tasks, taskDependencies, project, reassignTask } = useProject();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const suggestions = useMemo(
    () => generateRebalanceSuggestions(tasks, taskDependencies, project.memberHoursPerDay, project.dueDate, today),
    [tasks, taskDependencies, project, today]
  );

  const visible = suggestions.filter((s) => !dismissed.has(s.taskId));
  if (visible.length === 0) return null;

  function dismiss(taskId: string) {
    setDismissed((prev) => new Set(prev).add(taskId));
  }

  function accept(s: RebalanceSuggestion) {
    reassignTask(s.taskId, s.toMember);
  }

  return (
    <View style={styles.section}>
      <Text style={type.sectionHeading}>
        Workload {visible.length === 1 ? 'suggestion' : 'suggestions'} · {visible.length}
      </Text>
      <View style={styles.list}>
        {visible.map((s) => {
          const from = TEAM[s.fromMember];
          const to = TEAM[s.toMember];
          const impact = IMPACT[s.impact];
          const risk = riskLine(s);
          return (
            <Card key={s.taskId}>
              <View style={styles.card}>
                <View style={[styles.impactPill, { backgroundColor: impact.bg }]}>
                  <Text style={[type.badge, { color: impact.text }]}>{impact.label}</Text>
                </View>

                <Text style={[type.taskTitle, styles.heading]}>
                  Move <Text style={styles.headingTitle}>"{s.taskTitle}"</Text> to {to.name}
                </Text>

                <View style={styles.compareRow}>
                  <PersonImpact name={from.name} before={s.before.fromPct} after={s.after.fromPct} beforeHours={s.before.fromHours} afterHours={s.after.fromHours} capacityHours={s.capacityHours.from} />
                  <PersonImpact name={to.name} before={s.before.toPct} after={s.after.toPct} beforeHours={s.before.toHours} afterHours={s.after.toHours} capacityHours={s.capacityHours.to} />
                </View>

                <Text style={[type.caption, styles.reason]}>{s.reason}</Text>
                {risk ? <Text style={[type.caption, styles.riskText]}>{risk}</Text> : null}

                <Pressable
                  onPress={() => accept(s)}
                  style={styles.acceptButton}
                  accessibilityRole="button"
                  accessibilityLabel={`Reassign ${s.taskTitle} from ${from.name} to ${to.name}`}
                >
                  <Text style={[type.button, { color: colors.onInk }]}>Accept and reassign</Text>
                </Pressable>

                <Pressable
                  onPress={() => dismiss(s.taskId)}
                  style={styles.dismissButton}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={[type.button, { color: colors.muted }]}>Dismiss</Text>
                </Pressable>
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

function PersonImpact({
  name,
  before,
  after,
  beforeHours,
  afterHours,
  capacityHours,
}: {
  name: string;
  before: number;
  after: number;
  beforeHours: number;
  afterHours: number;
  capacityHours: number;
}) {
  // 150% of capacity fills the track — past that the bar just stays full rather than overflowing.
  const fillPct = Math.min(after / 1.5, 1) * 100;
  return (
    <View style={styles.person}>
      <Text style={[type.caption, styles.personName]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[type.button, { color: barColor(after) }]}>
        {pct(before)} → {pct(after)}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fillPct}%`, backgroundColor: barColor(after) }]} />
      </View>
      <Text style={[type.tinyLabel, styles.hoursText]}>
        {hours(beforeHours)}h → {hours(afterHours)}h of {hours(capacityHours)}h
      </Text>
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
    gap: 12,
  },
  impactPill: {
    alignSelf: 'flex-start',
    height: 22,
    paddingHorizontal: 10,
    borderRadius: 11,
    justifyContent: 'center',
  },
  heading: {
    color: colors.ink,
  },
  headingTitle: {
    fontFamily: type.taskTitle.fontFamily,
  },
  compareRow: {
    flexDirection: 'row',
    gap: 20,
  },
  person: {
    flex: 1,
    gap: 6,
  },
  personName: {
    color: colors.muted,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  hoursText: {
    color: colors.faint,
    fontVariant: ['tabular-nums'],
  },
  reason: {
    color: colors.muted,
  },
  riskText: {
    color: colors.redText,
  },
  acceptButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
});

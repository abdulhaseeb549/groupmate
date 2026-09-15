import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from './Card';
import { useProject } from '../state/ProjectRepository';
import { generateRebalanceSuggestions, RebalanceImpact, RebalanceSuggestion } from '../state/rebalancing';
import { colors, type } from '../theme';

type Props = {
  today: Date;
};

// Deliberately not "impact" — that read as project-risk impact and
// contradicted the risk line below it. These describe workload only.
const IMPACT: Record<RebalanceImpact, { label: string; bg: string; text: string }> = {
  high: { label: 'Reduces overload', bg: colors.mint, text: colors.mintText },
  medium: { label: 'Eases workload', bg: colors.yellowSoft, text: colors.yellowText },
  low: { label: 'Small adjustment', bg: colors.surfaceMuted, text: colors.muted },
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

// 100% isn't overloaded — it's full. Worth flagging as zero-buffer, not urgency.
function isAtCapacity(afterPct: number): boolean {
  return Math.round(afterPct * 100) === 100;
}

type RiskNote = { text: string; color: string };

// Amber, not red: a surfaced suggestion is always a valid move (the engine
// already rejected anything that isn't) — red is reserved for actual
// failure, not for "this alone doesn't clear the deadline risk."
function riskNote(s: RebalanceSuggestion): RiskNote | null {
  if (s.projectRiskAfter) {
    return {
      text: "The project remains at risk. This move reduces overload but doesn't resolve the deadline risk.",
      color: colors.yellowText,
    };
  }
  if (s.projectRiskBefore) {
    return { text: 'This also brings the project back on track.', color: colors.mintText };
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
  const { tasks, taskDependencies, project, members, membersById, reassignTask } = useProject();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState(false);
  // Suggestions are only safe as of the tasks snapshot they were computed
  // from. reassignTask itself doesn't re-check capacity, so two accepts
  // fired before a re-render could both land on the same person and blow
  // past the destination cap the engine enforced on each individually. The
  // ref is the actual guard — synchronous, so it can't be beaten by two
  // handlers running before React re-renders; the state is just so the
  // buttons visibly disable. Cleared once `tasks` has genuinely changed.
  const acceptingRef = useRef(false);

  useEffect(() => {
    acceptingRef.current = false;
    setAccepting(false);
  }, [tasks]);

  const memberIds = useMemo(() => members.map((m) => m.id), [members]);

  const suggestions = useMemo(
    () =>
      generateRebalanceSuggestions(
        tasks,
        taskDependencies,
        memberIds,
        membersById,
        project.memberHoursPerDay,
        project.dueDate,
        today
      ),
    [tasks, taskDependencies, memberIds, membersById, project, today]
  );

  const visible = suggestions.filter((s) => !dismissed.has(s.taskId));
  if (visible.length === 0) return null;

  function dismiss(taskId: string) {
    setDismissed((prev) => new Set(prev).add(taskId));
  }

  function accept(s: RebalanceSuggestion) {
    if (acceptingRef.current) return;
    acceptingRef.current = true;
    setAccepting(true);
    reassignTask(s.taskId, s.toMember);
  }

  return (
    <View style={styles.section}>
      <Text style={type.sectionHeading}>
        Workload {visible.length === 1 ? 'suggestion' : 'suggestions'} · {visible.length}
      </Text>
      <View style={styles.list}>
        {visible.map((s) => {
          const from = membersById[s.fromMember];
          const to = membersById[s.toMember];
          const impact = IMPACT[s.impact];
          const risk = riskNote(s);
          return (
            <Card key={s.taskId}>
              <View style={styles.card}>
                <View style={[styles.impactPill, { backgroundColor: impact.bg }]}>
                  <Text style={[type.badge, { color: impact.text }]}>{impact.label}</Text>
                </View>

                <View style={styles.headingBlock}>
                  <Text style={[type.taskTitle, styles.heading]}>Move task to {to.name}</Text>
                  <Text style={[type.caption, styles.taskName]} numberOfLines={2}>
                    {s.taskTitle}
                  </Text>
                </View>

                <View style={styles.compareRow}>
                  <PersonImpact
                    name={from.name}
                    before={s.before.fromPct}
                    after={s.after.fromPct}
                    beforeHours={s.before.fromHours}
                    afterHours={s.after.fromHours}
                    nearTermCrunch={s.fromNearTermCrunch}
                  />
                  <PersonImpact
                    name={to.name}
                    before={s.before.toPct}
                    after={s.after.toPct}
                    beforeHours={s.before.toHours}
                    afterHours={s.after.toHours}
                    nearTermCrunch={s.toNearTermCrunch}
                  />
                </View>

                <Text style={[type.caption, styles.reason]}>{s.reason}</Text>
                {risk ? <Text style={[type.caption, { color: risk.color }]}>{risk.text}</Text> : null}

                <Pressable
                  onPress={() => accept(s)}
                  disabled={accepting}
                  style={[styles.acceptButton, accepting && styles.acceptButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={`Reassign ${s.taskTitle} from ${from.name} to ${to.name}`}
                >
                  <Text style={[type.button, { color: colors.onInk }]}>Accept and reassign</Text>
                </Pressable>

                <Pressable
                  onPress={() => dismiss(s.taskId)}
                  disabled={accepting}
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
  nearTermCrunch,
}: {
  name: string;
  before: number;
  after: number;
  beforeHours: number;
  afterHours: number;
  /** Independent of loadPct — this person's *current* near-term schedule, not affected by whether this move happens. */
  nearTermCrunch: boolean;
}) {
  // 150% of capacity fills the track — past that the bar just stays full rather than overflowing.
  const fillPct = Math.min(after / 1.5, 1) * 100;
  return (
    <View style={styles.person}>
      <Text style={[type.caption, styles.personName]} numberOfLines={1}>
        {name}
      </Text>
      {/* Hours is the concrete number; percentage is secondary context under it, not the headline. */}
      <Text style={[type.button, styles.hoursLine]}>
        {hours(beforeHours)}h → {hours(afterHours)}h
      </Text>
      <Text style={[type.statLabel, { color: barColor(after) }]}>
        {pct(before)} → {pct(after)}
        {isAtCapacity(after) ? '  ·  at capacity' : ''}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fillPct}%`, backgroundColor: barColor(after) }]} />
      </View>
      {nearTermCrunch ? (
        <View style={styles.crunchTag}>
          <Text style={[type.tinyLabel, styles.crunchTagText]} numberOfLines={1}>
            Crunched near-term
          </Text>
        </View>
      ) : null}
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
  headingBlock: {
    gap: 2,
  },
  heading: {
    color: colors.ink,
  },
  taskName: {
    color: colors.muted,
  },
  compareRow: {
    flexDirection: 'row',
    gap: 20,
  },
  person: {
    flex: 1,
    gap: 4,
  },
  personName: {
    color: colors.muted,
  },
  hoursLine: {
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: 2,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  crunchTag: {
    alignSelf: 'flex-start',
    marginTop: 2,
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: colors.yellowSoft,
    justifyContent: 'center',
  },
  crunchTagText: {
    color: colors.yellowText,
  },
  reason: {
    color: colors.muted,
  },
  acceptButton: {
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonDisabled: {
    opacity: 0.5,
  },
  dismissButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
});

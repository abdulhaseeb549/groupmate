import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { FadeIn } from './FadeIn';
import { GradientButton } from './GradientButton';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { TaskFormModal } from './TaskFormModal';
import { Task, Priority, TaskStatus } from '../data/tasks';
import { useAuth } from '../state/AuthProvider';
import { shareTask } from '../state/messages';
import { useNavigation } from '../state/NavigationProvider';
import { notifyMessage } from '../state/pushNotifications';
import { useProject } from '../state/ProjectRepository';
import { TaskSchedule } from '../state/projectSchedule';
import { colors, type } from '../theme';
import { formatShortDate } from '../utils/dates';

type Props = {
  taskId: string | null;
  onClose: () => void;
  /** Fires after this modal successfully claims a task — lets a caller (e.g. chat) show its own confirmation. */
  onClaimed?: (task: Task) => void;
};

const PRIORITY: Record<Priority, { label: string; bg: string; fg: string }> = {
  high: { label: 'High', bg: colors.redSoft, fg: colors.redText },
  medium: { label: 'Medium', bg: colors.yellowSoft, fg: colors.yellowText },
  low: { label: 'Low', bg: 'rgba(21,21,26,0.05)', fg: colors.muted },
};

const STATUS: Record<TaskStatus, { label: string; bg: string; fg: string; ring: string; fill?: string }> = {
  not_started: { label: 'Not started', bg: 'rgba(21,21,26,0.05)', fg: colors.muted, ring: colors.control },
  in_progress: { label: 'In progress', bg: colors.purpleSoft, fg: colors.purple, ring: colors.purple },
  completed: { label: 'Done', bg: colors.mint, fg: colors.mintText, ring: colors.green, fill: colors.green },
};

/**
 * Task detail (board GTaskDetail): one sheet with every task action —
 * status, claim, the AI "Help", reassignment, share, edit, delete — so the
 * rows elsewhere stay scannable. The main action sits in a bar pinned to
 * the thumb zone.
 */
export function TaskDetailModal({ taskId, onClose, onClaimed }: Props) {
  const insets = useSafeAreaInsets();
  const {
    project,
    tasks,
    members,
    requirements,
    taskRequirements,
    taskDependencies,
    schedule,
    setTaskStatus,
    reassignTask,
    claimTask,
    generateTaskHelp,
    removeTask,
  } = useProject();
  const { session, profile } = useAuth();
  const { goToChat } = useNavigation();
  const currentUserId = session?.user.id;
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpLoading, setHelpLoading] = useState(false);
  const [helpError, setHelpError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);

  // The sheet animates out after taskId clears, so keep drawing the last
  // task until it has gone.
  const found = tasks.find((t) => t.id === taskId);
  const lastTask = useRef<Task | undefined>(found);
  if (found) lastTask.current = found;
  const task = found ?? lastTask.current;
  const visible = found !== undefined;

  function close() {
    setHelpOpen(false);
    setHelpError(null);
    setClaimError(null);
    setShareError(null);
    onClose();
  }

  const hasGuidance = Boolean(task?.guidance && task.guidance.trim().length > 0);
  const hasOutline = Boolean(task?.outline && task.outline.length > 0);
  const hasHelp = hasGuidance || hasOutline;

  /** Help is written the first time someone taps it on THIS task, then cached on the task. */
  async function handleHelpPress() {
    if (helpLoading || !task) return;
    if (helpOpen) {
      setHelpOpen(false);
      return;
    }
    if (hasHelp) {
      setHelpOpen(true);
      return;
    }
    setHelpLoading(true);
    setHelpError(null);
    const result = await generateTaskHelp(task.id);
    setHelpLoading(false);
    if (result.error) setHelpError(result.error);
    else setHelpOpen(true);
  }

  function confirmDelete() {
    if (!task) return;
    setDeleting(false);
    removeTask(task.id);
    close();
  }

  async function handleClaim() {
    if (!task || claiming || !currentUserId) return;
    setClaiming(true);
    setClaimError(null);
    const result = await claimTask(task.id);
    setClaiming(false);
    if (result.error) setClaimError(result.error);
    else onClaimed?.({ ...task, assigneeId: currentUserId });
  }

  async function handleShare() {
    if (!task || sharing || !currentUserId) return;
    setSharing(true);
    setShareError(null);
    try {
      await shareTask(project.id, currentUserId, task.id);
      // Task cards always go to the whole group: notify every other member.
      const senderName = profile?.fullName ?? 'Someone';
      for (const member of members) {
        if (member.id === currentUserId) continue;
        notifyMessage(member.id, senderName, `Shared a task: ${task.title}`, project.id);
      }
      setSharing(false);
      // Land where it landed.
      close();
      goToChat();
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Could not share this task.');
      setSharing(false);
    }
  }

  if (!task) return null;

  const priority = PRIORITY[task.priority];
  const status = STATUS[task.status];
  const completedDate = task.completedAt ? formatShortDate(new Date(task.completedAt), today) : null;
  const meta = [
    task.effortHours ? `${Number(task.effortHours.toFixed(1))}h` : null,
    task.status === 'completed' && completedDate ? `Done ${completedDate}` : task.dueLabel ? `Due ${task.dueLabel}` : null,
    task.sectionRef ? task.sectionRef : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const primary =
    task.status === 'not_started'
      ? { label: 'Start working', next: 'in_progress' as const }
      : task.status === 'in_progress'
        ? { label: 'Finish task', next: 'completed' as const }
        : { label: 'Reopen task', next: 'not_started' as const };

  return (
    <>
      <Sheet
        visible={visible}
        onClose={close}
        footer={
          <View style={styles.bar}>
            <Pressable
              onPress={handleShare}
              disabled={sharing}
              accessibilityRole="button"
              accessibilityLabel={`Share ${task.title} to chat`}
              style={({ pressed }) => [styles.share, pressed && styles.pressedLift]}
            >
              {sharing ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <Icon name="chat" size={18} color={colors.ink} strokeWidth={1.8} />
              )}
              <Text style={styles.shareText}>Share</Text>
            </Pressable>
            <GradientButton
              label={primary.label}
              onPress={() => setTaskStatus(task.id, primary.next)}
              style={styles.flex}
            />
          </View>
        }
      >
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 56 + 28 + 40 + Math.max(insets.bottom, 0) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {task.title}
            </Text>
            <Pressable
              onPress={() => setEditing(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit task"
              style={({ pressed }) => [styles.softButton, pressed && styles.pressed]}
            >
              <Icon name="edit" size={18} color={colors.ink} strokeWidth={1.8} />
            </Pressable>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.softButton, pressed && styles.pressed]}
            >
              <Icon name="close" size={18} color={colors.ink} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.pills}>
            <View style={[styles.pill, { backgroundColor: status.bg }]}>
              <View style={[styles.statusRing, { borderColor: status.ring, backgroundColor: status.fill ?? 'transparent' }]} />
              <Text style={[styles.pillText, { color: status.fg }]}>{status.label}</Text>
            </View>
            <View style={[styles.pill, { backgroundColor: priority.bg }]}>
              <Icon name="flagSolid" size={11} color={priority.fg} fill={priority.fg} strokeWidth={2} />
              <Text style={[styles.pillText, { color: priority.fg }]}>{priority.label}</Text>
            </View>
            {meta ? <Text style={[styles.m, task.dueUrgent && task.status !== 'completed' && styles.urgent]}>{meta}</Text> : null}
          </View>

          {task.assigneeId === null && currentUserId ? (
            <View style={styles.claimRow}>
              <View style={styles.claimDash} />
              <Text style={[styles.t, styles.claimText]}>Nobody yet</Text>
              <Pressable
                onPress={handleClaim}
                disabled={claiming}
                accessibilityRole="button"
                accessibilityLabel={`Claim ${task.title}`}
                style={({ pressed }) => [styles.claimButton, (pressed || claiming) && styles.pressedLift]}
              >
                <Text style={styles.claimButtonText}>{claiming ? 'Claiming…' : 'Claim it'}</Text>
              </Pressable>
            </View>
          ) : null}
          {claimError ? <ErrorBox text={claimError} /> : null}

          <PlanCard
            task={task}
            today={today}
            tasks={tasks}
            requirements={requirements}
            taskRequirements={taskRequirements}
            taskDependencies={taskDependencies}
            schedule={schedule.byTaskId[task.id]}
          />

          <View style={styles.helpSection}>
            <Pressable
              onPress={handleHelpPress}
              disabled={helpLoading}
              accessibilityRole="button"
              accessibilityState={{ expanded: helpOpen, busy: helpLoading }}
              accessibilityLabel={helpLoading ? 'Writing help' : 'Help'}
              style={({ pressed }) => [styles.helpRow, pressed && styles.pressed]}
            >
              <View style={styles.helpTile}>
                <Icon name="sparkle" size={19} color={colors.purple} strokeWidth={1.8} />
              </View>
              <Text style={[styles.t, styles.flex]}>{helpLoading ? 'Writing help…' : 'Help'}</Text>
              {helpLoading ? (
                <ActivityIndicator size="small" color={colors.muted} />
              ) : (
                <Icon name={helpOpen ? 'chevronUp' : 'chevronDown'} size={18} color={colors.muted} strokeWidth={2} />
              )}
            </Pressable>
            {helpError ? <ErrorBox text={helpError} /> : null}
            {helpOpen && hasHelp ? (
              <FadeIn>
                <View style={styles.helpBox}>
                  {hasGuidance ? (
                    <View style={styles.helpBlock}>
                      <Text style={styles.eyebrow}>What to write</Text>
                      <Text style={styles.helpText}>{task.guidance}</Text>
                    </View>
                  ) : null}
                  {hasOutline ? (
                    <View style={styles.helpBlock}>
                      <Text style={styles.eyebrow}>Outline</Text>
                      {task.outline!.map((point, i) => (
                        <View key={i} style={styles.bulRow}>
                          <View style={styles.bulDot} />
                          <Text style={styles.bulText}>{point}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </FadeIn>
            ) : null}
          </View>

          <View style={styles.assignSection}>
            <Text style={styles.eyebrow}>Assigned to</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.picks}
              accessibilityRole="radiogroup"
              accessibilityLabel="Assigned to"
            >
              <Pick
                label="Nobody"
                selected={task.assigneeId === null}
                onPress={() => reassignTask(task.id, null)}
                face={<View style={styles.nobodyFace} />}
              />
              {members.map((member) => (
                <Pick
                  key={member.id}
                  label={member.name.split(' ')[0]}
                  selected={member.id === task.assigneeId}
                  onPress={() => reassignTask(task.id, member.id)}
                  face={<Avatar initials={member.initials} bg={member.bg} fg={member.fg} size={44} />}
                />
              ))}
            </ScrollView>
          </View>

          {shareError ? <ErrorBox text={shareError} /> : null}

          <View style={styles.footLinks}>
            {task.status === 'in_progress' ? (
              <Pressable
                onPress={() => setTaskStatus(task.id, 'not_started')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.footLink, pressed && styles.pressed]}
              >
                <Text style={styles.backText}>Move back to not started</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setDeleting(true)}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${task.title}`}
              style={({ pressed }) => [styles.footLink, pressed && styles.pressed]}
            >
              <Text style={styles.deleteText}>Delete task</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Sheet>

      <TaskFormModal visible={editing} task={task} onClose={() => setEditing(false)} />
      <ConfirmDialog
        visible={deleting}
        title="Delete this task?"
        message={`"${task.title}" will be removed for everyone. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}

/**
 * What the app already knows about this task's place in the plan: the dates
 * the backward schedule gives it, what it waits on, what it unblocks and
 * which part of the brief it counts toward. Rows with nothing to say drop out.
 */
function PlanCard({
  task,
  today,
  tasks,
  requirements,
  taskRequirements,
  taskDependencies,
  schedule,
}: {
  task: Task;
  today: Date;
  tasks: Task[];
  requirements: { id: string; label: string }[];
  taskRequirements: { taskId: string; requirementId: string }[];
  taskDependencies: { taskId: string; dependsOnTaskId: string }[];
  schedule?: TaskSchedule;
}) {
  const done = task.status === 'completed';
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const waitingOn = taskDependencies
    .filter((d) => d.taskId === task.id)
    .map((d) => byId.get(d.dependsOnTaskId))
    .filter((t): t is Task => Boolean(t));
  const unblocks = (schedule?.blocks ?? []).map((id) => byId.get(id)).filter((t): t is Task => Boolean(t));
  const reqIds = new Set(taskRequirements.filter((r) => r.taskId === task.id).map((r) => r.requirementId));
  const countsToward = requirements.filter((r) => reqIds.has(r.id));

  const rows: { label: string; node: React.ReactNode }[] = [];
  if (schedule && !done) {
    const startPast = schedule.latestStart.getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    rows.push({
      label: 'Start by',
      node: (
        <View style={styles.planValueRow}>
          <Text style={[styles.t, schedule.atRisk && styles.urgent]}>
            {startPast ? 'Now' : formatShortDate(schedule.latestStart, today)}
          </Text>
          {schedule.atRisk ? (
            <View style={[styles.pill, { backgroundColor: colors.redSoft }]}>
              <Text style={[styles.pillText, { color: colors.redText }]}>Behind</Text>
            </View>
          ) : null}
        </View>
      ),
    });
    rows.push({ label: 'Done by', node: <Text style={styles.t}>{formatShortDate(schedule.latestFinish, today)}</Text> });
  }
  if (waitingOn.length > 0) {
    rows.push({
      label: 'Waiting on',
      node: (
        <View style={styles.planList}>
          {waitingOn.map((t) => (
            <View key={t.id} style={styles.planItem}>
              <Icon
                name={t.status === 'completed' ? 'tick' : 'clock'}
                size={14}
                color={t.status === 'completed' ? colors.mintText : colors.yellowText}
                strokeWidth={2.2}
              />
              <Text style={[styles.t, styles.flex, t.status === 'completed' && styles.planDone]} numberOfLines={2}>
                {t.title}
              </Text>
            </View>
          ))}
        </View>
      ),
    });
  }
  if (unblocks.length > 0) {
    rows.push({
      label: 'Unblocks',
      node: (
        <View style={styles.planList}>
          {unblocks.map((t) => (
            <Text key={t.id} style={styles.t} numberOfLines={2}>
              {t.title}
            </Text>
          ))}
        </View>
      ),
    });
  }
  if (countsToward.length > 0) {
    rows.push({
      label: 'Counts toward',
      node: (
        <View style={styles.chips}>
          {countsToward.map((r) => (
            <View key={r.id} style={styles.chip}>
              <Text style={styles.chipText} numberOfLines={3}>
                {r.label}
              </Text>
            </View>
          ))}
        </View>
      ),
    });
  }
  if (rows.length === 0) return null;

  return (
    <View style={styles.planSection}>
      <Text style={styles.eyebrow}>Plan</Text>
      <View style={styles.planCard}>
        {rows.map((row, i) => (
          <View key={row.label}>
            {i > 0 ? <View style={styles.hair} /> : null}
            <View style={styles.planRow}>
              <Text style={[styles.m, styles.planLabel]}>{row.label}</Text>
              <View style={styles.flex}>{row.node}</View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function Pick({ label, selected, onPress, face }: { label: string; selected: boolean; onPress: () => void; face: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.pick, pressed && styles.pressed]}
    >
      <View style={[styles.pickRing, selected && styles.pickRingOn]}>{face}</View>
      <Text style={[styles.pickLabel, selected && styles.pickLabelOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <Icon name="exclamation" size={18} color={colors.redText} strokeWidth={2.2} />
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Shadowed views shrink when pressed instead of fading: a faded view shows
  // its Android shadow through it as a grey box.
  pressedLift: {
    transform: [{ scale: 0.97 }],
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  body: {
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 16,
  },
  title: {
    flex: 1,
    paddingTop: 6,
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  softButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  pill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pillText: {
    fontFamily: type.badge.fontFamily,
    fontSize: 12,
    lineHeight: 16,
  },
  statusRing: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  t: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  m: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  urgent: {
    color: colors.redText,
  },
  eyebrow: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  claimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    paddingVertical: 12,
    paddingRight: 12,
    paddingLeft: 14,
    borderRadius: 18,
    backgroundColor: colors.yellowSoft,
  },
  claimDash: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D9B66A',
  },
  claimText: {
    flex: 1,
    color: colors.yellowText,
  },
  claimButton: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.08)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  claimButtonText: {
    fontFamily: type.button.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.purple,
  },
  planSection: {
    marginTop: 22,
    gap: 12,
  },
  planCard: {
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  planLabel: {
    width: 104,
    paddingTop: 2,
  },
  planValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  planList: {
    gap: 6,
  },
  planItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  planDone: {
    color: colors.muted,
  },
  hair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: colors.purpleSoft,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  chipText: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.purple,
  },
  helpSection: {
    marginTop: 20,
    gap: 8,
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    height: 52,
  },
  helpTile: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpBox: {
    gap: 14,
    padding: 16,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
  },
  helpBlock: {
    gap: 6,
  },
  helpText: {
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 21,
    color: colors.ink,
  },
  bulRow: {
    flexDirection: 'row',
    gap: 10,
  },
  bulDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.faint,
    marginTop: 8,
  },
  bulText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  assignSection: {
    marginTop: 22,
    gap: 12,
  },
  picks: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
  },
  pick: {
    width: 56,
    alignItems: 'center',
    gap: 6,
  },
  pickRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pickRingOn: {
    borderColor: colors.purple,
  },
  nobodyFace: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9C5D3',
  },
  pickLabel: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  pickLabelOn: {
    fontFamily: type.badge.fontFamily,
    color: colors.purple,
  },
  footLinks: {
    alignItems: 'center',
    marginTop: 10,
  },
  footLink: {
    height: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  backText: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.purple,
  },
  deleteText: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.redText,
  },
  bar: {
    flexDirection: 'row',
    gap: 10,
  },
  share: {
    width: 124,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.1)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  shareText: {
    fontFamily: type.button.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
    backgroundColor: colors.redSoft,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  errorText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.redText,
  },
});

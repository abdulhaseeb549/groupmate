import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { Icon } from './Icon';
import { TaskFormModal } from './TaskFormModal';
import { TaskStatusDot } from './TaskStatusDot';
import { Priority, TaskStatus } from '../data/tasks';
import { TEAM, TEAM_ORDER, TeamId } from '../data/team';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, type } from '../theme';
import { formatShortDate } from '../utils/dates';

type Props = {
  taskId: string | null;
  onClose: () => void;
};

const PRIORITY: Record<Priority, { label: string; mark: string; text: string }> = {
  high: { label: 'High priority', mark: colors.red, text: colors.redText },
  medium: { label: 'Medium priority', mark: colors.amber, text: colors.yellowText },
  low: { label: 'Low priority', mark: colors.faint, text: colors.muted },
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

/**
 * The one place every task action lives — status transitions, reassignment,
 * and the existing AI-written guidance/outline behind "Help" — so the
 * compact rows in the Tasks list can stay scannable instead of carrying a
 * button for each of these.
 */
export function TaskDetailModal({ taskId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { tasks, setTaskStatus, reassignTask, removeTask } = useProject();
  const [helpOpen, setHelpOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const today = useMemo(() => new Date(), []);

  const task = tasks.find((t) => t.id === taskId);
  const visible = task !== undefined;

  function close() {
    setHelpOpen(false);
    onClose();
  }

  function confirmDelete() {
    if (!task) return;
    setDeleting(false);
    removeTask(task.id);
    close();
  }

  if (!task) {
    return <Modal visible={false} transparent animationType="slide" />;
  }

  const priority = PRIORITY[task.priority];
  const hasGuidance = Boolean(task.guidance && task.guidance.trim().length > 0);
  const hasOutline = Boolean(task.outline && task.outline.length > 0);
  const hasHelp = hasGuidance || hasOutline;
  const completedDate = task.completedAt ? formatShortDate(new Date(task.completedAt), today) : null;

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={{ paddingBottom: 20 + Math.max(insets.bottom, 14) }}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={[type.sectionHeading, styles.title]}>{task.title}</Text>
            <Pressable
              style={styles.iconButton}
              onPress={() => setEditing(true)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${task.title}`}
            >
              <Icon name="edit" size={16} color={colors.ink} strokeWidth={1.8} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={close} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" size={16} color={colors.ink} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.metaRow}>
            <Icon name="flag" size={13} color={priority.mark} fill={priority.mark} strokeWidth={1.8} />
            <Text style={[type.caption, { color: priority.text }]}>{priority.label}</Text>
            {task.sectionRef ? (
              <>
                <Text style={[type.caption, styles.metaDot]}>·</Text>
                <Text style={[type.caption, styles.muted]}>{task.sectionRef}</Text>
              </>
            ) : null}
            {task.effortHours ? (
              <>
                <Text style={[type.caption, styles.metaDot]}>·</Text>
                <Text style={[type.caption, styles.muted]}>{Number(task.effortHours.toFixed(1))}h</Text>
              </>
            ) : null}
            {task.dueLabel ? (
              <>
                <Text style={[type.caption, styles.metaDot]}>·</Text>
                <Text style={[type.caption, task.dueUrgent ? styles.dueUrgent : styles.muted]}>{task.dueLabel}</Text>
              </>
            ) : null}
          </View>

          <View style={styles.statusRow}>
            <TaskStatusDot status={task.status} size={22} />
            <Text style={[type.button, styles.ink]}>
              {STATUS_LABEL[task.status]}
              {completedDate ? ` · ${completedDate}` : ''}
            </Text>
          </View>

          {task.status === 'not_started' ? (
            <Pressable
              onPress={() => setTaskStatus(task.id, 'in_progress')}
              style={styles.primaryButton}
              accessibilityRole="button"
            >
              <Text style={[type.button, { color: colors.onInk }]}>Start working</Text>
            </Pressable>
          ) : task.status === 'in_progress' ? (
            <>
              <Pressable
                onPress={() => setTaskStatus(task.id, 'completed')}
                style={styles.primaryButton}
                accessibilityRole="button"
              >
                <Text style={[type.button, { color: colors.onInk }]}>Finish task</Text>
              </Pressable>
              <Pressable onPress={() => setTaskStatus(task.id, 'not_started')} style={styles.linkButton} hitSlop={8}>
                <Text style={[type.caption, styles.link]}>Move back to not started</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => setTaskStatus(task.id, 'not_started')} style={styles.linkButton} hitSlop={8}>
              <Text style={[type.caption, styles.link]}>Reopen task</Text>
            </Pressable>
          )}

          {hasHelp ? (
            <Pressable
              onPress={() => setHelpOpen((v) => !v)}
              style={styles.helpButton}
              accessibilityRole="button"
              accessibilityLabel={`${helpOpen ? 'Hide' : 'Show'} what to write for ${task.title}`}
            >
              <Text style={[type.button, styles.ink]}>{helpOpen ? 'Hide help' : 'Help'}</Text>
              <Icon name={helpOpen ? 'chevronUp' : 'chevronDown'} size={14} color={colors.muted} strokeWidth={2} />
            </Pressable>
          ) : null}

          {helpOpen && hasGuidance ? (
            <View style={styles.guidanceBox}>
              <Text style={[type.metadata, styles.eyebrow]}>WHAT TO WRITE</Text>
              <Text style={[type.body, styles.ink]}>{task.guidance}</Text>
            </View>
          ) : null}
          {helpOpen && hasOutline ? (
            <View style={styles.guidanceBox}>
              <Text style={[type.metadata, styles.eyebrow]}>OUTLINE</Text>
              {task.outline!.map((point, i) => (
                <View key={i} style={styles.outlineRow}>
                  <View style={styles.outlineDot} />
                  <Text style={[type.body, styles.ink]}>{point}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.assignSection}>
            <Text style={[type.metadata, styles.eyebrow]}>ASSIGNED TO</Text>
            <View style={styles.assignRow}>
              {TEAM_ORDER.map((id) => (
                <Pressable
                  key={id}
                  onPress={() => reassignTask(task.id, id)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={`Assign to ${TEAM[id].name}`}
                  style={styles.assignOption}
                >
                  <Avatar {...TEAM[id]} size={40} borderColor={id === task.assigneeId ? colors.purple : colors.surface} />
                  <Text
                    style={[type.tinyLabel, id === task.assigneeId ? styles.assignNameActive : styles.muted]}
                    numberOfLines={1}
                  >
                    {TEAM[id].name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => setDeleting(true)}
            style={styles.deleteLink}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${task.title}`}
          >
            <Text style={[type.caption, styles.deleteLinkText]}>Delete task</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>

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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20,16,30,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  title: {
    flex: 1,
    color: colors.ink,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 18,
  },
  metaDot: {
    color: colors.faint,
  },
  muted: {
    color: colors.muted,
  },
  ink: {
    color: colors.ink,
  },
  dueUrgent: {
    color: colors.redText,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  primaryButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  linkButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    marginBottom: 8,
  },
  link: {
    color: colors.purple,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginTop: 6,
    marginBottom: 12,
  },
  guidanceBox: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    gap: 6,
    marginBottom: 12,
  },
  eyebrow: {
    color: colors.muted,
    letterSpacing: 0.4,
  },
  outlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 2,
  },
  outlineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.faint,
    marginTop: 9,
  },
  assignSection: {
    gap: 10,
    marginTop: 8,
  },
  assignRow: {
    flexDirection: 'row',
    gap: 16,
  },
  assignOption: {
    alignItems: 'center',
    gap: 6,
    width: layout.checkboxSize + 44,
  },
  assignNameActive: {
    color: colors.purple,
  },
  deleteLink: {
    alignSelf: 'center',
    paddingVertical: 12,
    marginTop: 18,
  },
  deleteLinkText: {
    color: colors.redText,
  },
});

import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, UnclaimedAvatar } from './Avatar';
import { Icon } from './Icon';
import { Priority, Task } from '../data/tasks';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, type } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  /** Present to edit that task; absent to create a new one. */
  task?: Task | null;
  /** Only used when creating — who the new task should start assigned to. Null/absent means Unclaimed. */
  defaultAssignee?: string | null;
  onClose: () => void;
};

const PRIORITIES: Priority[] = ['high', 'medium', 'low'];
const PRIORITY_LABEL: Record<Priority, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const STEP = 0.5;
const MIN_HOURS = 0.5;
const MAX_HOURS = 40;

function formatHours(n: number): string {
  return `${Number(n.toFixed(1))}h`;
}

/**
 * Shared create/edit form for a task's hand-correctable fields — title,
 * priority, effort, due label, section reference, and which requirements it
 * counts toward. Never touches guidance/outline (AI-written) or status/
 * assignee-on-an-existing-task (their own dedicated flows already live in
 * TaskDetailModal) — assignee only appears here when creating, since a new
 * task needs one from the start.
 */
export function TaskFormModal({ visible, task, defaultAssignee, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { members, requirements, taskRequirements, addTask, updateTask } = useProject();
  const isEdit = Boolean(task);

  const [title, setTitle] = useState('');
  const [sectionRef, setSectionRef] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(defaultAssignee ?? null);
  const [priority, setPriority] = useState<Priority>('medium');
  const [effortHours, setEffortHours] = useState(2);
  const [dueLabel, setDueLabel] = useState('');
  const [requirementIds, setRequirementIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever a different task opens (or the sheet re-opens for a new one).
  useEffect(() => {
    if (!visible) return;
    setError(null);
    setSaving(false);
    if (task) {
      setTitle(task.title);
      setSectionRef(task.sectionRef);
      setAssigneeId(task.assigneeId);
      setPriority(task.priority);
      setEffortHours(task.effortHours ?? 2);
      setDueLabel(task.dueLabel ?? '');
      setRequirementIds(taskRequirements.filter((tr) => tr.taskId === task.id).map((tr) => tr.requirementId));
    } else {
      setTitle('');
      setSectionRef('');
      setAssigneeId(defaultAssignee ?? null);
      setPriority('medium');
      setEffortHours(2);
      setDueLabel('');
      setRequirementIds([]);
    }
  }, [visible, task?.id]);

  function toggleRequirement(id: string) {
    setRequirementIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  }

  const canSave = title.trim().length > 0;

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const fields = {
      title: title.trim(),
      sectionRef: sectionRef.trim(),
      priority,
      effortHours,
      dueLabel: dueLabel.trim() || undefined,
      requirementIds,
    };
    const result = task
      ? await updateTask(task.id, fields)
      : await addTask({ ...fields, assigneeId });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={{ paddingBottom: 20 + Math.max(insets.bottom, 14) }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={type.pageTitle}>{isEdit ? 'Edit task' : 'New task'}</Text>
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" size={16} color={colors.ink} strokeWidth={2.2} />
            </Pressable>
          </View>

          <Field label="Title">
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="What needs to get done?"
              placeholderTextColor={colors.faint}
              style={styles.input}
            />
          </Field>

          {!isEdit ? (
            <Field label="Assigned to">
              <View style={styles.assignRow}>
                <Pressable
                  onPress={() => setAssigneeId(null)}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel="Leave unclaimed"
                  style={styles.assignOption}
                >
                  <UnclaimedAvatar size={40} borderColor={assigneeId === null ? colors.purple : undefined} />
                  <Text style={[type.tinyLabel, assigneeId === null ? styles.assignNameActive : styles.muted]} numberOfLines={1}>
                    Unclaimed
                  </Text>
                </Pressable>
                {members.map((member) => (
                  <Pressable
                    key={member.id}
                    onPress={() => setAssigneeId(member.id)}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={`Assign to ${member.name}`}
                    style={styles.assignOption}
                  >
                    <Avatar
                      {...member}
                      size={40}
                      borderColor={member.id === assigneeId ? colors.purple : colors.surface}
                    />
                    <Text
                      style={[type.tinyLabel, member.id === assigneeId ? styles.assignNameActive : styles.muted]}
                      numberOfLines={1}
                    >
                      {member.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </Field>
          ) : null}

          <Field label="Priority">
            <View style={styles.pillRow}>
              {PRIORITIES.map((p) => {
                const active = p === priority;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setPriority(p)}
                    style={[styles.pill, active && styles.pillActive]}
                    accessibilityRole="button"
                  >
                    <Text style={[type.button, { color: active ? colors.onInk : colors.muted }]}>{PRIORITY_LABEL[p]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label="Effort">
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setEffortHours((h) => Math.max(MIN_HOURS, h - STEP))}
                disabled={effortHours <= MIN_HOURS}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Decrease effort"
                style={[styles.stepButton, effortHours <= MIN_HOURS && styles.stepButtonDisabled]}
              >
                <Icon name="minus" size={14} color={colors.ink} strokeWidth={2.4} />
              </Pressable>
              <Text style={[type.button, styles.stepValue]}>{formatHours(effortHours)}</Text>
              <Pressable
                onPress={() => setEffortHours((h) => Math.min(MAX_HOURS, h + STEP))}
                disabled={effortHours >= MAX_HOURS}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Increase effort"
                style={[styles.stepButton, effortHours >= MAX_HOURS && styles.stepButtonDisabled]}
              >
                <Icon name="plus" size={14} color={colors.ink} strokeWidth={2.4} />
              </Pressable>
            </View>
          </Field>

          <View style={styles.row2}>
            <Field label="Due (optional)" style={styles.flex1}>
              <TextInput
                value={dueLabel}
                onChangeText={setDueLabel}
                placeholder="e.g. Thu"
                placeholderTextColor={colors.faint}
                style={styles.input}
              />
            </Field>
            <Field label="Reference (optional)" style={styles.flex1}>
              <TextInput
                value={sectionRef}
                onChangeText={setSectionRef}
                placeholder="e.g. §3.2"
                placeholderTextColor={colors.faint}
                style={styles.input}
              />
            </Field>
          </View>

          {requirements.length > 0 ? (
            <Field label="Counts toward">
              <View style={styles.chipRow}>
                {requirements.map((r) => {
                  const active = requirementIds.includes(r.id);
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => toggleRequirement(r.id)}
                      style={[styles.chip, active && styles.chipActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[type.caption, { color: active ? colors.purple : colors.muted }]} numberOfLines={1}>
                        {r.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
              <Text style={[type.caption, styles.errorText]}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={save}
            disabled={!canSave || saving}
            accessibilityRole="button"
            style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onInk} />
            ) : (
              <Text style={[type.button, { color: colors.onInk }]}>{isEdit ? 'Save changes' : 'Create task'}</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={[type.metadata, styles.eyebrow]}>{label.toUpperCase()}</Text>
      {children}
    </View>
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
    maxHeight: '90%',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    gap: 8,
    marginBottom: 16,
  },
  eyebrow: {
    color: colors.muted,
    letterSpacing: 0.4,
  },
  input: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.ink,
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
  },
  row2: {
    flexDirection: 'row',
    gap: 12,
  },
  flex1: {
    flex: 1,
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
  muted: {
    color: colors.muted,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDisabled: {
    opacity: 0.4,
  },
  stepValue: {
    color: colors.ink,
    minWidth: 50,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.purpleSoft,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.redSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    color: colors.redText,
  },
  saveButton: {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
});

import { ReactNode, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from './Avatar';
import { GradientButton } from './GradientButton';
import { Icon } from './Icon';
import { KeyboardAvoider } from './KeyboardAvoider';
import { Segmented } from './Segmented';
import { Sheet } from './Sheet';
import { Priority, Task } from '../data/tasks';
import { useProject } from '../state/ProjectRepository';
import { colors, type } from '../theme';

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
const PRIORITY_DOT: Record<Priority, string> = { high: colors.red, medium: colors.amber, low: '#C9C5D3' };
const STEP = 0.5;
const MIN_HOURS = 0.5;
const MAX_HOURS = 40;

function formatHours(n: number): string {
  return `${Number(n.toFixed(1))}h`;
}

/**
 * New / edit task (board GTaskForm). The hand-correctable fields only —
 * title, who (new tasks only), priority, effort, due, section, and what it
 * counts toward. AI help, status and reassignment live in task detail.
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
    const result = task ? await updateTask(task.id, fields) : await addTask({ ...fields, assigneeId });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      full
      footer={
        <GradientButton label={isEdit ? 'Save changes' : 'Create task'} onPress={save} disabled={!canSave} loading={saving} />
      }
    >
      <KeyboardAvoider style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 56 + 28 + 40 + Math.max(insets.bottom, 0) }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.h1} accessibilityRole="header">
              {isEdit ? 'Edit task' : 'New task'}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.softButton, pressed && styles.pressed]}
            >
              <Icon name="close" size={18} color={colors.ink} strokeWidth={2} />
            </Pressable>
          </View>

          <View style={styles.fields}>
            <Field label="Title">
              <Input value={title} onChangeText={setTitle} placeholder="What needs to get done?" autoFocus={!isEdit} />
            </Field>

            {!isEdit ? (
              <Field label="Who">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.picks}
                  accessibilityRole="radiogroup"
                  accessibilityLabel="Assigned to"
                >
                  <Pick
                    label="Nobody"
                    selected={assigneeId === null}
                    onPress={() => setAssigneeId(null)}
                    face={<View style={styles.nobodyFace} />}
                  />
                  {members.map((member) => (
                    <Pick
                      key={member.id}
                      label={member.name.split(' ')[0]}
                      selected={member.id === assigneeId}
                      onPress={() => setAssigneeId(member.id)}
                      face={<Avatar initials={member.initials} bg={member.bg} fg={member.fg} size={44} />}
                    />
                  ))}
                </ScrollView>
              </Field>
            ) : null}

            <Field label="Priority">
              <Segmented<Priority>
                label="Priority"
                value={priority}
                onChange={setPriority}
                options={PRIORITIES.map((p) => ({
                  value: p,
                  label: PRIORITY_LABEL[p],
                  leading: () => <View style={[styles.dot, { backgroundColor: PRIORITY_DOT[p] }]} />,
                }))}
              />
            </Field>

            <View style={styles.pair}>
              <Field label="Effort" style={styles.effortCol}>
                <View style={[styles.field, styles.stepper]}>
                  <Pressable
                    onPress={() => setEffortHours((h) => Math.max(MIN_HOURS, h - STEP))}
                    disabled={effortHours <= MIN_HOURS}
                    accessibilityRole="button"
                    accessibilityLabel="Less effort"
                    style={({ pressed }) => [styles.step, (pressed || effortHours <= MIN_HOURS) && styles.pressed]}
                  >
                    <Icon name="minus" size={16} color={colors.ink} strokeWidth={2.2} />
                  </Pressable>
                  <Text style={styles.stepValue}>{formatHours(effortHours)}</Text>
                  <Pressable
                    onPress={() => setEffortHours((h) => Math.min(MAX_HOURS, h + STEP))}
                    disabled={effortHours >= MAX_HOURS}
                    accessibilityRole="button"
                    accessibilityLabel="More effort"
                    style={({ pressed }) => [styles.step, (pressed || effortHours >= MAX_HOURS) && styles.pressed]}
                  >
                    <Icon name="plus" size={16} color={colors.ink} strokeWidth={2.2} />
                  </Pressable>
                </View>
              </Field>
              <Field label="Due" style={styles.flex}>
                <Input value={dueLabel} onChangeText={setDueLabel} placeholder="e.g. Thu" />
              </Field>
            </View>

            <Field label="Section">
              <Input value={sectionRef} onChangeText={setSectionRef} placeholder="e.g. §3.2" />
            </Field>

            {requirements.length > 0 ? (
              <Field label="Counts toward">
                <View style={styles.chips}>
                  {requirements.map((r) => {
                    const active = requirementIds.includes(r.id);
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => toggleRequirement(r.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [styles.chip, active && styles.chipOn, pressed && styles.pressed]}
                      >
                        {active ? <Icon name="tick" size={14} color={colors.purple} strokeWidth={2.4} /> : null}
                        <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>
                          {r.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Field>
            ) : null}

            {error ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Icon name="exclamation" size={18} color={colors.redText} strokeWidth={2.2} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoider>
    </Sheet>
  );
}

function Field({ label, children, style }: { label: string; children: ReactNode; style?: object }) {
  return (
    <View style={[styles.fl, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

/** KIT .field: 54 high, white, hairline border that turns purple with a soft ring on focus. */
function Input(props: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.field, focused && styles.fieldFocus]}>
      <TextInput
        {...props}
        placeholderTextColor={colors.faint}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={styles.input}
      />
    </View>
  );
}

function Pick({ label, selected, onPress, face }: { label: string; selected: boolean; onPress: () => void; face: ReactNode }) {
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.55 },
  body: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14 },
  h1: {
    flex: 1,
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.9,
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
  fields: { gap: 18, marginTop: 16 },
  fl: { gap: 8 },
  label: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  field: {
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  fieldFocus: {
    borderWidth: 1.5,
    borderColor: colors.purple,
    shadowColor: colors.purple,
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  input: {
    flex: 1,
    height: '100%',
    fontFamily: type.body.fontFamily,
    fontSize: 16,
    color: colors.ink,
    padding: 0,
  },
  picks: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 2 },
  pick: { width: 56, alignItems: 'center', gap: 6 },
  pickRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pickRingOn: { borderColor: colors.purple },
  nobodyFace: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#C9C5D3',
  },
  pickLabel: { fontFamily: type.metadata.fontFamily, fontSize: 12, lineHeight: 16, color: colors.muted },
  pickLabelOn: { fontFamily: type.badge.fontFamily, color: colors.purple },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pair: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  effortCol: { flex: 1.15, minWidth: 0 },
  stepper: { paddingHorizontal: 5, justifyContent: 'space-between' },
  step: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 17,
    lineHeight: 22,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
  },
  chipOn: { backgroundColor: colors.purpleSoft, borderColor: colors.track },
  chipText: { fontFamily: type.taskTitle.fontFamily, fontSize: 14, lineHeight: 20, color: colors.muted, flexShrink: 1 },
  chipTextOn: { fontFamily: type.button.fontFamily, color: colors.purple },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.redSoft,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  errorText: { flex: 1, fontFamily: type.caption.fontFamily, fontSize: 14, lineHeight: 20, color: colors.redText },
});

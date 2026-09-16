import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from './Icon';
import { useProject } from '../state/ProjectRepository';
import { colors, radius, type } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function parseIsoDate(iso: string): { year: string; month: string; day: string } {
  const [y, m, d] = iso.split('-');
  return { year: y, month: m, day: d };
}

/** True only for a real calendar date — catches e.g. day 31 in April rather than letting JS silently roll it into May. */
function isValidDate(year: string, month: string, day: string): boolean {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d || year.length !== 4) return false;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

function toIso(year: string, month: string, day: string): string {
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Plain numeric fields rather than a calendar picker — no date-picker
 * dependency exists in this app yet, and the underlying storage format
 * (YYYY-MM-DD) is exactly what this collects, so there's no translation
 * layer to get wrong either.
 */
export function DueDateModal({ visible, onClose }: Props) {
  const { project, updateDueDate } = useProject();
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');

  useEffect(() => {
    if (!visible) return;
    const parsed = parseIsoDate(project.dueDate);
    setYear(parsed.year);
    setMonth(parsed.month);
    setDay(parsed.day);
  }, [visible, project.dueDate]);

  const valid = isValidDate(year, month, day);

  function save() {
    if (!valid) return;
    updateDueDate(toIso(year, month, day));
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={type.projectTitle}>Change due date</Text>
            <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
              <Icon name="close" size={14} color={colors.ink} strokeWidth={2.2} />
            </Pressable>
          </View>
          <Text style={[type.caption, styles.muted]}>
            The Timeline and Workload suggestions recompute from this date.
          </Text>

          <View style={styles.dateRow}>
            <Field label="Year">
              <TextInput
                value={year}
                onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
                style={styles.input}
              />
            </Field>
            <Field label="Month">
              <TextInput
                value={month}
                onChangeText={(v) => setMonth(v.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.input}
              />
            </Field>
            <Field label="Day">
              <TextInput
                value={day}
                onChangeText={(v) => setDay(v.replace(/\D/g, '').slice(0, 2))}
                keyboardType="number-pad"
                maxLength={2}
                style={styles.input}
              />
            </Field>
          </View>

          {!valid && (year || month || day) ? (
            <Text style={[type.caption, styles.errorText]}>That's not a real date.</Text>
          ) : null}

          <View style={styles.row}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.pressed]}
            >
              <Text style={[type.button, styles.ink]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={!valid}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, styles.confirm, !valid && styles.confirmDisabled, pressed && styles.pressed]}
            >
              <Text style={[type.button, styles.onInk]}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[type.metadata, styles.muted]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,15,26,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 20,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ink: {
    color: colors.ink,
  },
  onInk: {
    color: colors.onInk,
  },
  muted: {
    color: colors.muted,
  },
  errorText: {
    color: colors.redText,
    marginTop: 4,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  field: {
    flex: 1,
    gap: 6,
  },
  input: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 12,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.ink,
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.75,
  },
  cancel: {
    backgroundColor: colors.surfaceMuted,
  },
  confirm: {
    backgroundColor: colors.purple,
  },
  confirmDisabled: {
    opacity: 0.5,
  },
});

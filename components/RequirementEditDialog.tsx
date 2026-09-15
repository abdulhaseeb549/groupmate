import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Requirement } from '../data/requirements';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, type } from '../theme';

type Props = {
  requirement: Requirement | null;
  onClose: () => void;
};

/**
 * A single-field correction, not a full sheet — same footprint as
 * ConfirmDialog. Exists because AI-extracted requirement labels
 * occasionally misread the brief, and until now there was no way to fix
 * one without regenerating the whole project.
 */
export function RequirementEditDialog({ requirement, onClose }: Props) {
  const { renameRequirement } = useProject();
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (requirement) setLabel(requirement.label);
  }, [requirement?.id]);

  function save() {
    if (!requirement || label.trim().length === 0) return;
    renameRequirement(requirement.id, label.trim());
    onClose();
  }

  return (
    <Modal visible={requirement !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={[type.projectTitle, styles.ink]}>Rename requirement</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Requirement label"
            placeholderTextColor={colors.faint}
            autoFocus
            style={styles.input}
          />
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
              disabled={label.trim().length === 0}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                styles.confirm,
                label.trim().length === 0 && styles.confirmDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[type.button, styles.onInk]}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,15,26,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: layout.screenPadding,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    gap: 14,
  },
  ink: {
    color: colors.ink,
  },
  onInk: {
    color: colors.onInk,
  },
  input: {
    height: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.ink,
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
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

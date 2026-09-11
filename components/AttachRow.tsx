import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { colors, type } from '../theme';
import { PdfFileInput } from '../utils/pdfPicker';

type Props = {
  label: string;
  file: PdfFileInput | null;
  onAttach: () => void;
  onRemove: () => void;
  disabled: boolean;
};

/** A dashed "attach a PDF" affordance that becomes a filled filename row once a file is picked. */
export function AttachRow({ label, file, onAttach, onRemove, disabled }: Props) {
  if (file) {
    return (
      <View style={styles.attachedRow}>
        <Icon name="document" size={16} color={colors.purple} strokeWidth={1.8} />
        <Text style={[type.body, styles.attachedName]} numberOfLines={1}>
          {file.filename}
        </Text>
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${file.filename}`}
        >
          <Icon name="close" size={16} color={colors.faint} strokeWidth={2} />
        </Pressable>
      </View>
    );
  }
  return (
    <Pressable
      onPress={onAttach}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.attachButton, pressed && styles.pressed]}
    >
      <Icon name="plus" size={15} color={colors.purple} strokeWidth={2.2} />
      <Text style={[type.button, styles.attachLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.6,
  },
  attachButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  attachLabel: {
    color: colors.purple,
  },
  attachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
  },
  attachedName: {
    flex: 1,
    color: colors.ink,
  },
});

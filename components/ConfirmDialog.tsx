import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, type } from '../theme';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Colors the confirm button's text/border red instead of purple. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * RN's Alert.alert is unreliable on web (react-native-web maps it to a
 * native window.confirm(), which automation and some browsers swallow
 * silently) and looks like a browser dialog rather than the app. This is
 * real app UI instead, so it behaves and looks the same everywhere.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={[type.projectTitle, styles.ink]}>{title}</Text>
          {message ? <Text style={[type.body, styles.muted, styles.message]}>{message}</Text> : null}
          <View style={styles.row}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.pressed]}
            >
              <Text style={[type.button, styles.ink]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                destructive ? styles.confirmDestructive : styles.confirmDefault,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[type.button, destructive ? styles.destructiveText : styles.onInk]}>
                {confirmLabel}
              </Text>
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
    gap: 6,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  onInk: {
    color: colors.onInk,
  },
  message: {
    marginBottom: 8,
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
  confirmDefault: {
    backgroundColor: colors.purple,
  },
  confirmDestructive: {
    backgroundColor: colors.redSoft,
  },
  destructiveText: {
    color: colors.redText,
  },
});

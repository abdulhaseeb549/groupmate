import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CapacityEditor } from './CapacityEditor';
import { Icon } from './Icon';
import { colors, type } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function CapacityModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: 20 + Math.max(insets.bottom, 14) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={type.pageTitle}>Hours per day</Text>
            <Pressable
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon name="close" size={16} color={colors.ink} strokeWidth={2.2} />
            </Pressable>
          </View>
          <Text style={[type.body, styles.subtitle]}>
            How much time each person can realistically give this project — the Timeline uses this to work out real
            dates, not just task counts.
          </Text>
          <CapacityEditor />
        </View>
      </View>
    </Modal>
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
    gap: 14,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    color: colors.muted,
  },
});

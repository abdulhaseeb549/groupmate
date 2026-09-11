import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DistributionEditor } from './DistributionEditor';
import { colors, type } from '../theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function DistributionModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: 20 + Math.max(insets.bottom, 14) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={type.pageTitle}>Work Distribution</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path d="M6 6l12 12M18 6 6 18" stroke={colors.ink} strokeWidth={2.2} strokeLinecap="round" />
              </Svg>
            </Pressable>
          </View>
          <Text style={[type.body, { color: colors.muted }]}>
            Tap a task to move it to someone else.
          </Text>
          <ScrollView style={styles.editorScroll} showsVerticalScrollIndicator={false}>
            <DistributionEditor />
          </ScrollView>
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
    maxHeight: '82%',
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
  editorScroll: {
    marginTop: 4,
  },
});

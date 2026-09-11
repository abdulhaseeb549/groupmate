import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, type } from '../theme';

type Props = {
  label: string;
  bg: string;
  /** Tints this tile's shadow so it reads as that color's own depth, not a generic gray drop shadow. */
  shadowColor: string;
  icon: React.ReactNode;
  onPress?: () => void;
};

export function QuickAction({ label, bg, shadowColor, icon, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tile, { backgroundColor: bg, shadowColor }]}
    >
      <View style={styles.iconWrap}>{icon}</View>
      <Text style={[type.category, styles.label]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    height: layout.quickActionHeight,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 10,
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  iconWrap: {
    width: layout.quickActionIconSize,
    height: layout.quickActionIconSize,
    borderRadius: layout.quickActionIconSize / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3C3255',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  label: {
    color: colors.ink,
    textAlign: 'center',
  },
});

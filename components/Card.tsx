import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme';

const RADIUS = 22;

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// Two layers on purpose: on iOS a view that clips its children also clips its own shadow.
export function Card({ children, style }: Props) {
  return (
    <View style={styles.shadow}>
      <View style={[styles.inner, style]}>{children}</View>
    </View>
  );
}

/** Starts where the row's text starts, iOS-style, rather than at the card edge. */
export function CardDivider({ inset = 0 }: { inset?: number }) {
  return <View style={[styles.divider, { marginLeft: inset }]} />;
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: RADIUS,
    backgroundColor: colors.surface,
    shadowColor: '#1C1633',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  inner: {
    borderRadius: RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
});

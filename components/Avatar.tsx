import { StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../theme';

type Props = {
  initials: string;
  bg: string;
  fg: string;
  size?: number;
  borderColor?: string;
  style?: object;
};

export function Avatar({ initials, bg, fg, size = 36, borderColor, style }: Props) {
  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          borderColor: borderColor ?? colors.surface,
          borderWidth: borderColor ? 2 : 0,
        },
        style,
      ]}
    >
      <Text style={[type.avatarInitials, { color: fg, fontSize: size <= 30 ? 10 : 13 }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export function LoadingScreen() {
  return (
    <View style={styles.screen}>
      <ActivityIndicator color={colors.purple} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

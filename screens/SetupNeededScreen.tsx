import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { colors, layout, type } from '../theme';

const STEPS = [
  'Create a project at supabase.com',
  'Run backend/supabase/migrations/0001_init.sql in its SQL Editor',
  'Copy frontend/.env.example to frontend/.env and fill in your Project URL and anon key',
  'Restart the dev server',
];

/** Shown instead of crashing when EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY aren't set yet. */
export function SetupNeededScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 32) + 40 }]}
    >
      <View style={styles.icon}>
        <Icon name="documentAlert" size={26} color={colors.purple} strokeWidth={1.7} />
      </View>
      <Text style={[type.pageTitle, styles.ink]}>Connect Supabase</Text>
      <Text style={[type.body, styles.muted]}>
        GroupMate needs a Supabase project before it can create real accounts.
      </Text>

      <View style={styles.list}>
        {STEPS.map((step, i) => (
          <View key={step} style={styles.step}>
            <View style={styles.stepNumber}>
              <Text style={[type.badge, styles.stepNumberText]}>{i + 1}</Text>
            </View>
            <Text style={[type.body, styles.ink, styles.stepText]}>{step}</Text>
          </View>
        ))}
      </View>

      <Text style={[type.caption, styles.muted]}>
        Full walkthrough: backend/supabase/README.md
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 40,
    gap: 12,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  list: {
    gap: 14,
    marginVertical: 12,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumberText: {
    color: colors.purple,
  },
  stepText: {
    flex: 1,
  },
});

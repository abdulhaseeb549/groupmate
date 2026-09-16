import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, CardDivider } from './Card';
import { Icon } from './Icon';
import { ExtractedProjectData } from '../state/briefParsing';
import { colors, type } from '../theme';
import { contentIcon } from '../utils/contentIcon';
import { formatDueDate } from '../utils/dates';

type Props = {
  extracted: ExtractedProjectData;
  today: Date;
  error: string | null;
  committing: boolean;
  onStartOver: () => void;
  onBuildPlan: () => void;
  /** Label for the confirm action — the wording differs between creating a first project and replacing an existing one. */
  buildLabel?: string;
};

/**
 * What the AI found in a brief, shown for review before anything is
 * written. Lives here rather than inside either screen that uses it: both
 * NewProjectScreen (replacing a brief) and OnboardingScreen (creating the
 * first project) render it, and OnboardingScreen importing it from
 * NewProjectScreen would close an import cycle back through
 * ProjectRepository — harmless in the dev bundler, the kind of thing that
 * silently breaks a release build.
 */
export function BriefReview({
  extracted,
  today,
  error,
  committing,
  onStartOver,
  onBuildPlan,
  buildLabel = 'Build my plan →',
}: Props) {
  return (
    <View style={styles.review}>
      <View style={styles.intro}>
        <Text style={[type.caption, styles.muted]}>Here's what I found — nothing's changed yet</Text>
        <Text style={[type.pageTitle, styles.ink]} numberOfLines={2}>
          {extracted.projectName}
        </Text>
        <Text style={[type.body, styles.muted]}>
          {extracted.course} · Due {formatDueDate(extracted.dueDate, today)}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[type.button, styles.ink]}>
          {extracted.requirements.length} {extracted.requirements.length === 1 ? 'requirement' : 'requirements'}
        </Text>
        <Card>
          {extracted.requirements.map((r, i) => (
            <View key={r.label}>
              {i > 0 ? <CardDivider inset={16 + 16 + 10} /> : null}
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Icon name={contentIcon(r.label)} size={16} color={colors.muted} strokeWidth={1.8} />
                </View>
                <Text style={[type.body, styles.ink, styles.rowLabel]}>{r.label}</Text>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={[type.button, styles.ink]}>
          {extracted.tasks.length} {extracted.tasks.length === 1 ? 'task' : 'tasks'}
        </Text>
        <Text style={[type.caption, styles.muted]}>Unclaimed until someone on your team picks it up</Text>
        <Card>
          {extracted.tasks.map((t, i) => (
            <View key={i}>
              {i > 0 ? <CardDivider inset={16 + 16 + 10} /> : null}
              <View style={styles.row}>
                <View style={styles.rowIcon}>
                  <Icon name={contentIcon(t.title)} size={16} color={colors.muted} strokeWidth={1.8} />
                </View>
                <Text style={[type.body, styles.ink, styles.rowLabel]} numberOfLines={2}>
                  {t.title}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
          <Text style={[type.caption, styles.errorText]}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onStartOver}
          disabled={committing}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={[type.button, styles.ink]}>Start over</Text>
        </Pressable>
        <Pressable
          onPress={onBuildPlan}
          disabled={committing}
          accessibilityRole="button"
          style={({ pressed }) => [styles.submit, styles.buildButton, pressed && !committing && styles.submitPressed]}
        >
          {committing ? (
            <>
              <ActivityIndicator color={colors.onInk} />
              <Text style={[type.button, styles.submitLabel]}>Building your plan…</Text>
            </>
          ) : (
            <Text style={[type.button, styles.submitLabel]}>{buildLabel}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  review: {
    gap: 22,
  },
  intro: {
    gap: 8,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  section: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowIcon: {
    marginTop: 3,
  },
  rowLabel: {
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.redSoft,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    flex: 1,
    color: colors.redText,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  submit: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buildButton: {
    flex: 2,
  },
  submitPressed: {
    opacity: 0.85,
  },
  submitLabel: {
    color: colors.onInk,
  },
});

import { StyleSheet, Text, View } from 'react-native';
import { Glass } from './Glass';
import { GradientButton, SecondaryButton } from './GradientButton';
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
  /** Label for the confirm action — the wording differs between creating a first project and adding another. */
  buildLabel?: string;
  /**
   * The parent docks <BriefReviewActions> over the bottom of the screen itself
   * (board GBriefReview: a glass bar the list scrolls under). Off by default,
   * so a parent that only renders <BriefReview> still gets its buttons inline.
   */
  hideActions?: boolean;
};

/**
 * Board GBriefReview: what the AI found in a brief, shown for review before
 * anything is written. Lives here rather than inside either screen that uses
 * it: both NewProjectScreen and OnboardingScreen render it, and
 * OnboardingScreen importing it from NewProjectScreen would close an import
 * cycle back through ProjectRepository — harmless in the dev bundler, the
 * kind of thing that silently breaks a release build.
 */
export function BriefReview({
  extracted,
  today,
  error,
  committing,
  onStartOver,
  onBuildPlan,
  buildLabel,
  hideActions = false,
}: Props) {
  const reqCount = extracted.requirements.length;
  const taskCount = extracted.tasks.length;
  return (
    <View style={styles.review}>
      <View style={styles.intro}>
        <Text style={styles.eyebrow}>Found in your brief</Text>
        <Text style={styles.h1} numberOfLines={3} accessibilityRole="header">
          {extracted.projectName}
        </Text>
        <Text style={styles.sub}>
          {extracted.course} · Due {formatDueDate(extracted.dueDate, today)}
          {extracted.dueDateMissing ? ' (not in the brief, change it any time)' : ''}
        </Text>
      </View>

      {/* Numbers lead: how big the job is, before the detail. */}
      <View
        style={[styles.card, styles.numbers]}
        accessible
        accessibilityLabel={`${reqCount} requirements, ${taskCount} tasks`}
      >
        <View style={styles.numberCol}>
          <Text style={styles.big}>{reqCount}</Text>
          <Text style={styles.m}>{reqCount === 1 ? 'Requirement' : 'Requirements'}</Text>
        </View>
        <View style={styles.vrule} />
        <View style={styles.numberCol}>
          <Text style={styles.big}>{taskCount}</Text>
          <Text style={styles.m}>{taskCount === 1 ? 'Task' : 'Tasks'}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.lead}>Requirements</Text>
        <View style={[styles.card, styles.listCard]}>
          {extracted.requirements.map((r, i) => (
            <View key={r.label + i}>
              {i > 0 ? <View style={styles.sep} /> : null}
              <Row label={r.label} />
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.lead}>Tasks</Text>
          <Text style={styles.m}>Nobody yet</Text>
        </View>
        <View style={[styles.card, styles.listCard]}>
          {extracted.tasks.map((t, i) => (
            <View key={i}>
              {i > 0 ? <View style={styles.sep} /> : null}
              <Row label={t.title} />
            </View>
          ))}
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
          <Text style={[styles.m, styles.errorText]}>{error}</Text>
        </View>
      ) : null}

      {hideActions ? null : (
        <BriefReviewActions
          committing={committing}
          onStartOver={onStartOver}
          onBuildPlan={onBuildPlan}
          buildLabel={buildLabel}
        />
      )}
    </View>
  );
}

function Row({ label }: { label: string }) {
  return (
    <View style={styles.li}>
      <View style={styles.ic}>
        <Icon name={contentIcon(label)} size={16} color={colors.muted} strokeWidth={1.8} />
      </View>
      <Text style={[styles.t, styles.flex]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** "Start over" + "Build my plan". Inline by default; docked prop puts it in the board's glass bar. */
export function BriefReviewActions({
  committing,
  onStartOver,
  onBuildPlan,
  buildLabel = 'Build my plan',
  docked = false,
  bottom = 16,
}: {
  committing: boolean;
  onStartOver: () => void;
  onBuildPlan: () => void;
  buildLabel?: string;
  docked?: boolean;
  /** Docked only: distance from the screen bottom (16 + the home-indicator inset). */
  bottom?: number;
}) {
  // Older callers pass labels ending in an arrow; the boards have none.
  const label = buildLabel.replace(/\s*→\s*$/, '');
  const buttons = (
    <>
      <SecondaryButton
        label="Start over"
        onPress={() => {
          if (!committing) onStartOver();
        }}
        style={styles.startOver}
      />
      <GradientButton
        label={committing ? 'Building your plan…' : label}
        onPress={onBuildPlan}
        loading={committing}
        disabled={committing}
        style={styles.flex}
      />
    </>
  );
  if (!docked) return <View style={styles.actions}>{buttons}</View>;
  return (
    <Glass radius={26} style={[styles.bar, { bottom }]}>
      {buttons}
    </Glass>
  );
}

const styles = StyleSheet.create({
  review: {
    gap: 22,
  },
  intro: {
    gap: 6,
  },
  eyebrow: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  h1: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  sub: {
    fontFamily: type.caption.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  numbers: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  numberCol: {
    flex: 1,
    gap: 4,
  },
  big: {
    fontFamily: 'CabinetGrotesk-Extrabold',
    fontSize: 40,
    lineHeight: 40,
    letterSpacing: -1.2,
    color: colors.ink,
  },
  vrule: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: '#ECEAF0',
    marginHorizontal: 20,
  },
  section: {
    gap: 10,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lead: {
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
  },
  listCard: {
    paddingVertical: 4,
  },
  li: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  ic: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ECEAF0',
    marginLeft: 60,
  },
  t: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  m: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  flex: {
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.redSoft,
    borderRadius: 16,
    padding: 14,
  },
  errorText: {
    flex: 1,
    color: colors.redText,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  startOver: {
    width: 120,
  },
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
});

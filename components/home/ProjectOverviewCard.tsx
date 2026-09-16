import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../Avatar';
import { Card } from '../Card';
import { Icon } from '../Icon';
import { Project } from '../../data/project';
import { Member } from '../../data/member';
import { ProjectHealth, ProjectState } from '../../state/projectState';
import { colors, layout, type } from '../../theme';
import { formatDueDate } from '../../utils/dates';

type Props = {
  project: Project;
  state: ProjectState;
  members: Member[];
  today: Date;
  onOpen: () => void;
};

const HEALTH: Record<ProjectHealth, { label: string; bg: string; dot: string; text: string }> = {
  on_track: { label: 'On track', bg: colors.mint, dot: colors.green, text: colors.mintText },
  at_risk: { label: 'At risk', bg: colors.yellowSoft, dot: colors.amber, text: colors.yellowText },
  ready: { label: 'Ready', bg: colors.mint, dot: colors.green, text: colors.mintText },
};

/** Two-tone: pale purple for the project's context, white for the numbers. */
export function ProjectOverviewCard({ project, state, members, today, onOpen }: Props) {
  const health = HEALTH[state.health];
  const { taskProgress, requirementProgress } = state;
  const percent = Math.round(taskProgress.pct * 100);

  return (
    <Card>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${project.name}, ${health.label}, ${percent} percent done`}
        accessibilityHint="Opens the project"
        style={({ pressed }) => [styles.top, pressed && styles.pressed]}
      >
        <View style={styles.header}>
          <View style={styles.iconTile}>
            <Icon name="document" size={20} color={colors.purple} />
          </View>
          <View style={styles.titleBlock}>
            <Text style={[type.projectTitle, styles.ink]} numberOfLines={1}>
              {project.name}
            </Text>
            <Text style={[type.caption, styles.muted]} numberOfLines={1}>
              {project.team} · Due {formatDueDate(project.dueDate, today)}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: health.bg }]}>
            <View style={[styles.pillDot, { backgroundColor: health.dot }]} />
            <Text style={[type.badge, { color: health.text }]} numberOfLines={1}>
              {health.label}
            </Text>
          </View>
          {/* Muted, not faint: faint all but disappears on the pale purple. */}
          <Icon name="chevronRight" size={18} color={colors.muted} strokeWidth={2} />
        </View>

        <View style={styles.progressRow}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          <Text style={[type.button, styles.ink, styles.percent]}>{percent}%</Text>
        </View>
      </Pressable>

      <View style={styles.stats}>
        <Stat label="Tasks" a11y={`Tasks: ${taskProgress.done} of ${taskProgress.total} done`}>
          <Fraction value={taskProgress.done} total={taskProgress.total} />
        </Stat>
        <View style={styles.statDivider} />
        <Stat
          label="Requirements"
          a11y={`Requirements: ${requirementProgress.met} of ${requirementProgress.total} met`}
        >
          <Fraction value={requirementProgress.met} total={requirementProgress.total} />
        </Stat>
        <View style={styles.statDivider} />
        <Stat label={`${members.length} members`} a11y={`${members.length} members`}>
          <View style={styles.faces}>
            {members.map((m, i) => (
              <Avatar
                key={m.id}
                initials={m.initials}
                bg={m.bg}
                fg={m.fg}
                size={24}
                borderColor={colors.surface}
                style={i > 0 ? styles.faceOverlap : undefined}
              />
            ))}
          </View>
        </Stat>
      </View>
    </Card>
  );
}

function Stat({ label, a11y, children }: { label: string; a11y: string; children: ReactNode }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={a11y}>
      {children}
      <Text style={[type.caption, styles.muted]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Fraction({ value, total }: { value: number; total: number }) {
  return (
    <Text style={[type.statNumber, styles.ink]}>
      {value}
      <Text style={[type.subtitle, styles.muted]}>/{total}</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  top: {
    backgroundColor: colors.purpleSoft,
    padding: 16,
    gap: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconTile: {
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: layout.iconTileRadius,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // See ProjectsScreen's healthPill: a fixed height clipped the label to a
    // half-visible second line at large system font scales. This row also
    // holds a flex:1 title, so the pill has to refuse to shrink as well.
    minHeight: layout.pillHeight,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: layout.pillRadius,
    flexShrink: 0,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.purple,
  },
  percent: {
    minWidth: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 26,
  },
  faceOverlap: {
    marginLeft: -7,
  },
});

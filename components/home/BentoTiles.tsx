import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Avatar } from '../Avatar';
import { Project } from '../../data/project';
import { Member } from '../../data/member';
import { ProjectHealth, ProjectState } from '../../state/projectState';
import { colors, radius, type } from '../../theme';
import { formatDueDate } from '../../utils/dates';

const HEALTH: Record<ProjectHealth, { label: string; bg: string; dot: string; text: string }> = {
  on_track: { label: 'On track', bg: colors.mint, dot: colors.green, text: colors.mintText },
  at_risk: { label: 'At risk', bg: colors.yellowSoft, dot: colors.amber, text: colors.yellowText },
  ready: { label: 'Ready', bg: colors.mint, dot: colors.green, text: colors.mintText },
};

const RING_SIZE = 72;
const RING_STROKE = 6;
const MAX_FACES = 3;

type ProjectTileProps = {
  project: Project;
  state: ProjectState;
  today: Date;
  onOpen: () => void;
};

/**
 * The project, as the tall half of the bento. Pale purple because it is the
 * context everything else on Home belongs to; the ring is the one place its
 * progress is drawn, so it is drawn big.
 */
export function ProjectTile({ project, state, today, onOpen }: ProjectTileProps) {
  const health = HEALTH[state.health];
  const percent = Math.round(state.taskProgress.pct * 100);
  const daysLeft = daysUntil(project.dueDate, today);
  const context = [project.course, project.team].filter(Boolean).join(' · ').toUpperCase();
  const due =
    daysLeft < 0
      ? `Was due ${formatDueDate(project.dueDate, today)}`
      : daysLeft === 0
        ? 'Due today'
        : `${formatDueDate(project.dueDate, today)} · ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`;

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${project.name}, ${health.label}, ${percent} percent done, ${due}`}
      accessibilityHint="Opens the project"
      style={({ pressed }) => [styles.projectTile, pressed && styles.pressed]}
    >
      <View style={styles.projectTop}>
        <Ring percent={percent} />
        <View style={[styles.pill, { backgroundColor: health.bg }]}>
          <View style={[styles.pillDot, { backgroundColor: health.dot }]} />
          <Text style={[type.badge, { color: health.text }]} numberOfLines={1}>
            {health.label}
          </Text>
        </View>
      </View>

      {/* No faces here: the team tile beside it already shows them. */}
      <View style={styles.projectText}>
        {context ? (
          <Text style={[type.metadata, styles.muted, styles.eyebrow]} numberOfLines={1}>
            {context}
          </Text>
        ) : null}
        <Text style={[type.projectTitle, styles.ink]} numberOfLines={3}>
          {project.name}
        </Text>
        <Text style={[type.caption, styles.muted]} numberOfLines={1}>
          {due}
        </Text>
      </View>
    </Pressable>
  );
}

function Ring({ percent }: { percent: number }) {
  const r = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(Math.max(percent, 0), 100) / 100);
  return (
    <View style={styles.ring}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} stroke={colors.track} strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={r}
          stroke={colors.purple}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          // Start at 12 o'clock, not 3.
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <Text style={[type.button, styles.ink, styles.ringText]}>{percent}%</Text>
    </View>
  );
}

type MiniTileProps = {
  /** The tile's top-left mark: an icon tile, or faces. */
  lead: ReactNode;
  /** Optional mark on the top-right, e.g. a "New" pill. */
  badge?: ReactNode;
  title: string;
  caption: string;
  accessibilityLabel: string;
  onPress: () => void;
};

/** The short halves of the bento: a mark, a title, and one live line. */
export function MiniTile({ lead, badge, title, caption, accessibilityLabel, onPress }: MiniTileProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.miniShadow, pressed && styles.pressed]}
    >
      <View style={styles.miniTile}>
        <View style={styles.miniTop}>
          {lead}
          {badge}
        </View>
        <View style={styles.miniText}>
          <Text style={[type.taskTitle, styles.ink]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[type.caption, styles.muted]} numberOfLines={1}>
            {caption}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Up to three overlapping faces; a green dot on anyone online right now. */
export function OnlineFaces({ members, onlineIds }: { members: Member[]; onlineIds: Set<string> }) {
  const shown = [...members].sort((a, b) => Number(onlineIds.has(b.id)) - Number(onlineIds.has(a.id))).slice(0, MAX_FACES);
  return (
    <View style={styles.faces}>
      {shown.map((m, i) => (
        <View key={m.id} style={i > 0 ? styles.faceOverlap : undefined}>
          <Avatar initials={m.initials} bg={m.bg} fg={m.fg} size={30} borderColor={colors.surface} />
          {onlineIds.has(m.id) ? <View style={styles.onlineDot} /> : null}
        </View>
      ))}
    </View>
  );
}

function daysUntil(isoDate: string, today: Date) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.75,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  projectTile: {
    flex: 1,
    borderRadius: radius.card,
    backgroundColor: colors.purpleSoft,
    padding: 16,
    gap: 14,
  },
  // Wraps so the health pill drops under the ring on narrow phones (360px)
  // rather than being cut to "On tr…".
  projectTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    position: 'absolute',
    fontVariant: ['tabular-nums'],
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 24,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 12,
    flexShrink: 0,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  projectText: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 2,
  },
  eyebrow: {
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  faces: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  faceOverlap: {
    marginLeft: -8,
  },
  miniShadow: {
    flex: 1,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    shadowColor: '#1C1633',
    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  miniTile: {
    flex: 1,
    borderRadius: radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
    padding: 14,
    gap: 10,
    justifyContent: 'space-between',
  },
  miniTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  miniText: {
    gap: 1,
  },
  onlineDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.green,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});

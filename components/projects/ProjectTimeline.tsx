import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { GradientButton } from '../GradientButton';
import { Icon } from '../Icon';
import { TaskDetailModal } from '../TaskDetailModal';
import { Task } from '../../data/tasks';
import { useAuth } from '../../state/AuthProvider';
import { useProject } from '../../state/ProjectRepository';
import { ProjectSchedule } from '../../state/projectSchedule';
import { colors, type } from '../../theme';

type Props = {
  tasks: Task[];
  schedule: ProjectSchedule;
  dueDate: string;
  today: Date;
  /** Members already nudged this session (owned by ProjectsScreen, shared with the workload list). */
  nudgedIds?: Set<string>;
  onNudge?: (memberId: string) => void;
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ROW = 62;
const END_ROW = 52;
const DOT = 22;
const RING = 68;
const RING_R = 29;
const RING_STROKE = 7;

const CARD = '#1B1A22';
const MINT = '#2FB67C';
const CORAL = '#E95B57';
const LAVENDER = '#B9A9F5';
const AMBER_ON_DARK = '#F5C76A';
const CORAL_ON_DARK = '#FF9B97';
const LAVENDER_ON_DARK = '#CFC4FA';

/** "Mon 16" */
function shortDay(d: Date) {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

type Kind = 'done' | 'behind' | 'mine' | 'theirs' | 'nobody';

/**
 * Board "B · Dark path": checkpoints, not a fabricated Gantt chart. Every
 * node is a real task that at least one other task depends on, at the real
 * latest-safe finish the backward scheduler computed from effort, capacity
 * and the dependency graph. A task nothing depends on isn't a checkpoint
 * and doesn't appear. Every row opens the same TaskDetailModal as every
 * other task list, and the first teammate who is behind can be nudged from
 * here with the nudge the workload list already sends.
 */
export function ProjectTimeline({ tasks, schedule, dueDate, today, nudgedIds, onNudge }: Props) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { membersById } = useProject();
  const { session } = useAuth();
  const me = session?.user.id;

  const checkpoints = tasks
    .filter((t) => schedule.byTaskId[t.id]?.isCheckpoint)
    .sort((a, b) => schedule.byTaskId[a.id].latestFinish.getTime() - schedule.byTaskId[b.id].latestFinish.getTime());

  if (checkpoints.length === 0) {
    return (
      <View style={[styles.card, styles.emptyCard]}>
        <Icon name="documentAlert" size={18} color="rgba(255,255,255,0.55)" strokeWidth={1.8} />
        <Text style={styles.emptyText}>
          Checkpoints show up once tasks depend on each other. This project doesn't have any dependencies yet.
        </Text>
      </View>
    );
  }

  const [y, m, d] = dueDate.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const daysLeft = Math.round((due.getTime() - startOfDay(today).getTime()) / 86_400_000);
  const handIn = `${WEEKDAYS[due.getDay()]} ${due.getDate()} ${MONTHS[due.getMonth()]}`;

  const rows = checkpoints.map((task) => {
    const s = schedule.byTaskId[task.id];
    const assignee = task.assigneeId ? membersById[task.assigneeId] : undefined;
    const first = assignee ? assignee.name.split(' ')[0] : null;
    const kind: Kind =
      task.status === 'completed'
        ? 'done'
        : s.atRisk
          ? 'behind'
          : !assignee
            ? 'nobody'
            : task.assigneeId === me
              ? 'mine'
              : 'theirs';
    const unblocks = s.blocks.length > 0 ? ` · unblocks ${s.blocks.length}` : '';
    const meta =
      kind === 'done'
        ? `${first ?? 'Done'}${first ? ' · done' : ''}`
        : kind === 'behind'
          ? first
            ? `Behind · ${task.assigneeId === me ? 'start this now' : `${first} should start now`}`
            : 'Behind · nobody yet'
          : kind === 'nobody'
            ? 'Nobody yet'
            : kind === 'mine'
              ? `Yours${unblocks}`
              : `${first}${unblocks}`;
    return { task, kind, meta, date: shortDay(s.latestFinish) };
  });

  const doneCount = rows.filter((r) => r.kind === 'done').length;
  const behindCount = rows.filter((r) => r.kind === 'behind').length;
  const circumference = 2 * Math.PI * RING_R;
  const progress = doneCount / rows.length;

  const headline =
    daysLeft > 1
      ? `${daysLeft} days to hand in`
      : daysLeft === 1
        ? '1 day to hand in'
        : daysLeft === 0
          ? 'Hand in today'
          : `${-daysLeft} ${daysLeft === -1 ? 'day' : 'days'} past hand in`;
  const subline =
    behindCount > 0 ? `${handIn} · ${behindCount} ${behindCount === 1 ? 'checkpoint' : 'checkpoints'} behind` : `${handIn} · on track`;

  // The first teammate who is behind and isn't me: the one nudge worth offering.
  const nudgeRow = rows.find((r) => r.kind === 'behind' && r.task.assigneeId && r.task.assigneeId !== me);
  const nudgeMember = nudgeRow?.task.assigneeId ? membersById[nudgeRow.task.assigneeId] : undefined;
  const nudged = nudgeMember ? (nudgedIds?.has(nudgeMember.id) ?? false) : false;

  return (
    <>
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.ring}>
            <Svg width={RING} height={RING}>
              <Circle cx={RING / 2} cy={RING / 2} r={RING_R} stroke="rgba(255,255,255,0.1)" strokeWidth={RING_STROKE} fill="none" />
              {doneCount > 0 ? (
                <Circle
                  cx={RING / 2}
                  cy={RING / 2}
                  r={RING_R}
                  stroke={LAVENDER}
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                  fill="none"
                  strokeDasharray={`${circumference * progress} ${circumference}`}
                  transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
                />
              ) : null}
            </Svg>
            <Text style={styles.ringText} accessibilityLabel={`${doneCount} of ${rows.length} checkpoints done`}>
              {doneCount}/{rows.length}
            </Text>
          </View>
          <View style={styles.headText}>
            <Text style={styles.headline}>{headline}</Text>
            <Text style={styles.subline}>{subline}</Text>
          </View>
        </View>

        {daysLeft > 0 ? (
          <Runway
            today={startOfDay(today)}
            due={due}
            points={rows.map((r) => ({
              id: r.task.id,
              kind: r.kind,
              at: startOfDay(schedule.byTaskId[r.task.id].latestFinish),
            }))}
          />
        ) : (
          <View style={styles.hair} />
        )}

        <View>
          {rows.map((row, i) => {
            const isLast = i === rows.length - 1;
            return (
              <Pressable
                key={row.task.id}
                onPress={() => setOpenTaskId(row.task.id)}
                accessibilityRole="button"
                accessibilityLabel={`${row.task.title}, ${row.meta}${row.kind === 'done' ? '' : `, by ${row.date}`}`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                {/* The path down to the next node; mint while the work behind it is done. */}
                <View
                  style={[
                    styles.connector,
                    { height: isLast ? ROW - ROW / 2 + END_ROW / 2 : ROW },
                    row.kind === 'done' && styles.connectorDone,
                  ]}
                />
                <View style={styles.dotSlot}>
                  {row.kind === 'behind' ? <View style={[styles.halo, styles.haloCoral]} /> : null}
                  {row.kind === 'mine' ? <View style={[styles.halo, styles.haloLavender]} /> : null}
                  <View style={[styles.dot, DOT_STYLE[row.kind]]}>
                    {row.kind === 'done' ? <Icon name="tick" size={11} color="#FFFFFF" strokeWidth={4} /> : null}
                  </View>
                </View>
                <View style={styles.rowText}>
                  <Text
                    numberOfLines={1}
                    style={[styles.title, row.kind === 'done' && styles.titleDone, row.kind === 'mine' && styles.titleMine]}
                  >
                    {row.task.title}
                  </Text>
                  <Text numberOfLines={1} style={[styles.meta, META_STYLE[row.kind]]}>
                    {row.meta}
                  </Text>
                </View>
                {row.kind === 'done' ? null : (
                  <Text style={[styles.date, row.kind === 'behind' && styles.dateBehind]}>{row.date}</Text>
                )}
              </Pressable>
            );
          })}

          <View style={styles.endRow}>
            <View style={styles.dotSlot}>
              <View style={styles.flag}>
                <Icon name="flagSolid" size={11} color={CARD} strokeWidth={2} />
              </View>
            </View>
            <Text style={styles.endText}>Hand in · {handIn}</Text>
          </View>
        </View>
      </View>

      {nudgeRow && nudgeMember && onNudge ? (
        <GradientButton
          label={nudged ? `Nudged ${nudgeMember.name.split(' ')[0]}` : `Nudge ${nudgeMember.name.split(' ')[0]} about ${nudgeRow.task.title.toLowerCase()}`}
          onPress={() => onNudge(nudgeMember.id)}
          disabled={nudged}
          style={styles.nudge}
        />
      ) : null}

      <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </>
  );
}

const TRACK_DOT = 14;
const LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Board "A · Runway", inside the dark card: today on the left, hand-in on
 * the right, each checkpoint on its real latest-safe finish date. Anything
 * already past its date sits at today, because that is when it has to happen.
 */
function Runway({
  today,
  due,
  points,
}: {
  today: Date;
  due: Date;
  points: { id: string; kind: Kind; at: Date }[];
}) {
  const [width, setWidth] = useState(0);
  const span = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  const xFor = (d: Date) => {
    const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    return (Math.min(Math.max(days, 0), span) / span) * width;
  };
  const showLetters = span <= 14;
  const days = Array.from({ length: span + 1 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));

  return (
    <View style={styles.runway} onLayout={(e) => setWidth(e.nativeEvent.layout.width - TRACK_DOT)}>
      <View style={styles.trackLine} />
      {width > 0
        ? points.map((p) => (
            <View
              key={p.id}
              style={[styles.trackDot, TRACK_DOT_STYLE[p.kind], { left: xFor(p.at) }]}
            />
          ))
        : null}
      {width > 0 ? (
        <View style={[styles.trackFlag, { left: width - 3 }]}>
          <Icon name="flagSolid" size={9} color={CARD} strokeWidth={2} />
        </View>
      ) : null}
      {showLetters ? (
        <View style={styles.letters}>
          {days.map((d, i) => (
            <Text key={i} style={[styles.letter, (i === 0 || i === span) && styles.letterStrong]}>
              {LETTERS[d.getDay()]}
            </Text>
          ))}
        </View>
      ) : null}
      <View style={styles.runwayLabels}>
        <Text style={styles.runwayLabel}>Today</Text>
        <Text style={styles.runwayLabel}>Hand in</Text>
      </View>
    </View>
  );
}

const TRACK_DOT_STYLE: Record<Kind, object> = {
  done: { backgroundColor: MINT },
  behind: { backgroundColor: CORAL },
  mine: { backgroundColor: LAVENDER },
  theirs: { backgroundColor: CARD, borderWidth: 2, borderColor: '#FFFFFF' },
  nobody: { backgroundColor: CARD, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)', borderStyle: 'dashed' },
};

const styles = StyleSheet.create({
  runway: {
    paddingTop: 4,
  },
  trackLine: {
    marginHorizontal: TRACK_DOT / 2,
    marginTop: TRACK_DOT / 2 - 1.5,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  trackDot: {
    position: 'absolute',
    top: 4,
    width: TRACK_DOT,
    height: TRACK_DOT,
    borderRadius: TRACK_DOT / 2,
  },
  trackFlag: {
    position: 'absolute',
    top: 1,
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  letter: {
    width: TRACK_DOT,
    textAlign: 'center',
    fontFamily: type.caption.fontFamily,
    fontSize: 11,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  letterStrong: {
    fontFamily: type.sectionHeading.fontFamily,
    color: '#FFFFFF',
  },
  runwayLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  runwayLabel: {
    fontFamily: type.caption.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.55)',
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 26,
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 22,
    shadowColor: '#1C1633',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 18 },
    elevation: 8,
  },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  emptyText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.62)',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  ring: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: {
    position: 'absolute',
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 20,
    color: '#FFFFFF',
  },
  headText: {
    flex: 1,
    gap: 3,
  },
  headline: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 24,
    lineHeight: 27,
    letterSpacing: -0.5,
    color: '#FFFFFF',
  },
  subline: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.62)',
  },
  hair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pressed: {
    opacity: 0.6,
  },
  connector: {
    position: 'absolute',
    left: DOT / 2 - 1,
    top: ROW / 2,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  connectorDone: {
    backgroundColor: MINT,
  },
  dotSlot: {
    width: DOT,
    height: DOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: DOT + 10,
    height: DOT + 10,
    borderRadius: (DOT + 10) / 2,
  },
  haloCoral: {
    backgroundColor: 'rgba(233,91,87,0.22)',
  },
  haloLavender: {
    backgroundColor: 'rgba(185,169,245,0.22)',
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: '#FFFFFF',
  },
  titleDone: {
    color: 'rgba(255,255,255,0.55)',
    textDecorationLine: 'line-through',
  },
  titleMine: {
    fontFamily: type.sectionHeading.fontFamily,
  },
  meta: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
  },
  date: {
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.8)',
  },
  dateBehind: {
    color: CORAL_ON_DARK,
  },
  endRow: {
    height: END_ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  flag: {
    width: DOT,
    height: DOT,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endText: {
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: '#FFFFFF',
  },
  nudge: {
    marginTop: 16,
  },
});

const DOT_STYLE: Record<Kind, object> = {
  done: { backgroundColor: MINT },
  behind: { backgroundColor: CORAL },
  mine: { backgroundColor: LAVENDER },
  theirs: { backgroundColor: CARD, borderWidth: 2.5, borderColor: '#FFFFFF' },
  nobody: { backgroundColor: CARD, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', borderStyle: 'dashed' },
};

const META_STYLE: Record<Kind, object> = {
  done: { color: 'rgba(255,255,255,0.45)' },
  behind: { color: CORAL_ON_DARK },
  mine: { color: LAVENDER_ON_DARK },
  theirs: { color: 'rgba(255,255,255,0.62)' },
  nobody: { color: AMBER_ON_DARK },
};

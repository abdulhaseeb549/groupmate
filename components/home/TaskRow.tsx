import { useEffect, useRef, useState } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { Priority, Task } from '../../data/tasks';
import { colors, layout, type } from '../../theme';

// Low stays grey so only medium and high draw the eye when scanning the list.
const PRIORITY: Record<Priority, { label: string; mark: string; text: string }> = {
  high: { label: 'High', mark: colors.red, text: colors.redText },
  medium: { label: 'Medium', mark: colors.amber, text: colors.yellowText },
  low: { label: 'Low', mark: colors.faint, text: colors.muted },
};

type Props = {
  task: Task;
  /** What finishing it moves forward — the requirement it counts toward, a word count, etc. */
  context?: string;
  onComplete: () => void;
};

export function TaskRow({ task, context, onComplete }: Props) {
  const [completing, setCompleting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function complete() {
    if (completing) return;
    setCompleting(true);
    // Hold for a beat so the tick registers before the row leaves the list.
    timer.current = setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onComplete();
    }, 260);
  }

  const priority = PRIORITY[task.priority];
  const hasGuidance = Boolean(task.guidance && task.guidance.trim().length > 0);
  const hasOutline = Boolean(task.outline && task.outline.length > 0);
  const expandable = hasGuidance || hasOutline;

  function toggleExpand() {
    if (!expandable) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }

  return (
    <View style={styles.row}>
      <Pressable
        onPress={complete}
        hitSlop={10}
        accessibilityRole="checkbox"
        aria-checked={completing}
        accessibilityLabel={`Mark ${task.title} as done`}
        style={[styles.checkbox, completing && styles.checkboxChecked]}
      >
        {completing ? <Icon name="check" size={15} color={colors.onInk} strokeWidth={2.6} /> : null}
      </Pressable>

      <Pressable
        onPress={toggleExpand}
        disabled={!expandable}
        accessibilityRole={expandable ? 'button' : undefined}
        accessibilityLabel={expandable ? `${expanded ? 'Hide' : 'Show'} what to write for ${task.title}` : undefined}
        style={styles.body}
      >
        <View style={styles.titleLine}>
          <Text style={[type.taskTitle, styles.title, completing && styles.titleDone]} numberOfLines={2}>
            {task.title}
          </Text>
          {expandable ? (
            <Icon name={expanded ? 'chevronUp' : 'chevronDown'} size={14} color={colors.faint} strokeWidth={2} />
          ) : null}
          {task.dueLabel ? <DuePill label={task.dueLabel} urgent={task.dueUrgent === true} /> : null}
        </View>
        <View style={styles.metaLine}>
          <Icon name="flag" size={13} color={priority.mark} fill={priority.mark} strokeWidth={1.8} />
          <Text style={[type.caption, styles.meta]} numberOfLines={1}>
            <Text style={[styles.priority, { color: priority.text }]}>{priority.label}</Text>
            {context ? ` · ${context}` : ''}
          </Text>
        </View>
        {expanded && hasGuidance ? (
          <View style={styles.guidanceBox}>
            <Text style={[type.metadata, styles.guidanceLabel]}>WHAT TO WRITE</Text>
            <Text style={[type.body, styles.guidanceText]}>{task.guidance}</Text>
          </View>
        ) : null}
        {expanded && hasOutline ? (
          <View style={styles.outlineBox}>
            <Text style={[type.metadata, styles.guidanceLabel]}>OUTLINE</Text>
            {task.outline!.map((point, i) => (
              <View key={i} style={styles.outlineRow}>
                <View style={styles.outlineDot} />
                <Text style={[type.body, styles.outlineText]}>{point}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

function DuePill({ label, urgent }: { label: string; urgent: boolean }) {
  return (
    <View style={[styles.due, urgent ? styles.dueUrgent : styles.dueNeutral]}>
      {urgent ? <View style={styles.dueDot} /> : null}
      <Text style={[type.badge, { color: urgent ? colors.redText : colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  checkbox: {
    width: layout.checkboxSize,
    height: layout.checkboxSize,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.control,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -1,
  },
  checkboxChecked: {
    backgroundColor: colors.purple,
    borderColor: colors.purple,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  title: {
    flex: 1,
    color: colors.ink,
  },
  titleDone: {
    color: colors.muted,
    textDecorationLine: 'line-through',
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  meta: {
    flex: 1,
    color: colors.muted,
  },
  priority: {
    fontFamily: type.metadata.fontFamily,
  },
  guidanceBox: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    gap: 4,
  },
  guidanceLabel: {
    color: colors.muted,
    letterSpacing: 0.4,
  },
  guidanceText: {
    color: colors.ink,
  },
  outlineBox: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.surfaceMuted,
    gap: 6,
  },
  outlineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 2,
  },
  outlineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.faint,
    marginTop: 9,
  },
  outlineText: {
    flex: 1,
    color: colors.ink,
  },
  due: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: layout.pillHeight,
    paddingHorizontal: 9,
    borderRadius: layout.pillRadius,
    marginTop: -1,
  },
  dueUrgent: {
    backgroundColor: colors.redSoft,
  },
  dueNeutral: {
    backgroundColor: colors.surfaceMuted,
  },
  dueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.red,
  },
});

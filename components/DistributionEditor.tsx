import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Avatar } from './Avatar';
import { TEAM, TEAM_ORDER, TeamId } from '../data/team';
import { useProject } from '../state/ProjectRepository';
import { colors, type } from '../theme';

type Props = {
  /** Which people's groups to render — defaults to everyone. */
  members?: TeamId[];
};

export function DistributionEditor({ members = TEAM_ORDER }: Props) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // `tasks`/`blockingRequirementsByTask` come from the full project state
  // regardless of the `members` filter, so blocking status stays correct
  // even when only one person's group shows.
  const { tasks, projectState, reassignTask } = useProject();
  const { blockingRequirementsByTask } = projectState;

  function reassign(taskId: string, memberId: TeamId) {
    reassignTask(taskId, memberId);
    setOpenTaskId(null);
  }

  return (
    <View style={styles.container}>
      {members.map((memberId) => {
        const member = TEAM[memberId];
        const memberTasks = tasks.filter((t) => t.assigneeId === memberId);
        return (
          <View key={memberId} style={styles.group}>
            <View style={styles.groupHeader}>
              <Avatar {...member} size={30} />
              <Text style={[type.button, styles.groupName]}>{member.name}</Text>
              <View style={styles.countPill}>
                <Text style={[type.metadata, { color: colors.ink }]}>
                  {memberTasks.length} {memberTasks.length === 1 ? 'task' : 'tasks'}
                </Text>
              </View>
            </View>

            <View style={styles.taskList}>
              {memberTasks.map((t) => {
                const blocking = blockingRequirementsByTask[t.id] ?? [];
                return (
                <View key={t.id}>
                  <Pressable
                    style={styles.taskRow}
                    onPress={() => setOpenTaskId(openTaskId === t.id ? null : t.id)}
                  >
                    <View style={styles.taskRef}>
                      <Text style={[type.metadata, { color: colors.purple }]}>{t.sectionRef}</Text>
                    </View>
                    <View style={styles.taskTitleBlock}>
                      <Text style={[type.body, styles.taskTitle]} numberOfLines={2}>
                        {t.title}
                      </Text>
                      {blocking.length > 0 && (
                        <Text style={[type.statLabel, styles.blockingTag]} numberOfLines={1}>
                          Blocks {blocking.map((r) => r.label).join(', ')}
                        </Text>
                      )}
                    </View>
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                      <Path
                        d={openTaskId === t.id ? 'M6 15l6-6 6 6' : 'M9 5l7 7-7 7'}
                        stroke={colors.faint}
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </Pressable>

                  {openTaskId === t.id && (
                    <View style={styles.reassignRow}>
                      <Text style={[type.statLabel, { color: colors.muted }]}>Move to</Text>
                      {TEAM_ORDER.filter((id) => id !== memberId).map((id) => (
                        <Pressable key={id} onPress={() => reassign(t.id, id)} style={styles.reassignOption}>
                          <Avatar {...TEAM[id]} size={28} />
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  group: {
    gap: 9,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupName: {
    color: colors.ink,
    flex: 1,
  },
  countPill: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskList: {
    gap: 6,
    paddingLeft: 40,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 44,
    paddingVertical: 4,
  },
  taskRef: {
    width: 34,
  },
  taskTitleBlock: {
    flex: 1,
    gap: 2,
  },
  taskTitle: {
    color: colors.ink,
    opacity: 0.7,
  },
  blockingTag: {
    color: colors.yellowText,
  },
  reassignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 8,
    paddingLeft: 43,
  },
  reassignOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

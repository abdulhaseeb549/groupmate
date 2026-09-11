import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { colors, type } from '../theme';
import { contentIcon } from '../utils/contentIcon';

export type PersonTasks = {
  initials: string;
  name: string;
  bg: string;
  fg: string;
  tasks: { title: string }[];
};

type Props = {
  people: PersonTasks[];
};

/** Who's doing what — every task title grouped under the person it's assigned to. */
export function TaskDivision({ people }: Props) {
  return (
    <View style={styles.card}>
      {people.map((person, i) => (
        <View key={person.initials}>
          {i > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.person}>
            <View style={styles.personHeader}>
              <Avatar initials={person.initials} bg={person.bg} fg={person.fg} size={28} />
              <Text style={[type.button, styles.name]} numberOfLines={1}>
                {person.name}
              </Text>
              <Text style={[type.metadata, styles.count]}>
                {person.tasks.length} {person.tasks.length === 1 ? 'task' : 'tasks'}
              </Text>
            </View>
            {person.tasks.length > 0 ? (
              <View style={styles.taskList}>
                {person.tasks.map((task, ti) => (
                  <View key={ti} style={styles.taskRow}>
                    <View style={styles.taskIcon}>
                      <Icon name={contentIcon(task.title)} size={14} color={colors.faint} strokeWidth={1.8} />
                    </View>
                    <Text style={[type.body, styles.taskTitle]} numberOfLines={2}>
                      {task.title}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  person: {
    gap: 10,
  },
  personHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    color: colors.ink,
    flex: 1,
  },
  count: {
    color: colors.muted,
  },
  taskList: {
    gap: 8,
    paddingLeft: 38,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  taskIcon: {
    marginTop: 3,
  },
  taskTitle: {
    flex: 1,
    color: colors.ink,
  },
});

import { StyleSheet, Text, View } from 'react-native';
import { Avatar } from './Avatar';
import { colors, type } from '../theme';

export type Assignee = {
  initials: string;
  name: string;
  bg: string;
  fg: string;
  taskCount: number;
};

type Props = {
  assignees: Assignee[];
};

export function WorkDivision({ assignees }: Props) {
  return (
    <View style={styles.card}>
      <Text style={[type.metadata, { color: colors.muted }]}>WORK DIVIDED EVENLY</Text>
      <View style={styles.rows}>
        {assignees.map((a) => (
          <View key={a.initials} style={styles.row}>
            <Avatar initials={a.initials} bg={a.bg} fg={a.fg} size={30} />
            <Text style={[type.body, styles.name]} numberOfLines={1}>
              {a.name}
            </Text>
            <View style={styles.countPill}>
              <Text style={[type.metadata, { color: colors.ink }]}>
                {a.taskCount} {a.taskCount === 1 ? 'task' : 'tasks'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    gap: 11,
  },
  rows: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
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
});

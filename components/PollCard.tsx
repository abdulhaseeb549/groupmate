import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, type } from '../theme';

type Option = { id: string; label: string; votes: number };

type Props = {
  question: string;
  options: Option[];
};

export function PollCard({ question, options: initialOptions }: Props) {
  const [options, setOptions] = useState(initialOptions);
  const [votedId, setVotedId] = useState<string | null>(null);

  const total = options.reduce((sum, o) => sum + o.votes, 0);

  function vote(id: string) {
    if (votedId === id) return;
    setOptions((prev) =>
      prev.map((o) => {
        if (o.id === id) return { ...o, votes: o.votes + 1 };
        if (o.id === votedId) return { ...o, votes: Math.max(0, o.votes - 1) };
        return o;
      }),
    );
    setVotedId(id);
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path
            d="M6 20V10M12 20V4M18 20v-7"
            stroke={colors.purple}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        <Text style={[type.metadata, { color: colors.purple }]}>POLL</Text>
      </View>

      <Text style={[type.taskTitle, styles.question]}>{question}</Text>

      <View style={styles.options}>
        {options.map((o) => {
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          const selected = votedId === o.id;
          return (
            <Pressable key={o.id} onPress={() => vote(o.id)} style={styles.optionRow}>
              <View style={styles.optionTrack}>
                <View style={[styles.optionFill, { width: `${pct}%` }]} />
                <View style={styles.optionContent}>
                  <View style={styles.optionLeft}>
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected && <View style={styles.radioDot} />}
                    </View>
                    <Text style={[type.body, styles.optionLabel]} numberOfLines={1}>
                      {o.label}
                    </Text>
                  </View>
                  <Text style={[type.metadata, { color: colors.muted }]}>{pct}%</Text>
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={[type.statLabel, { color: colors.muted }]}>
        {total} {total === 1 ? 'vote' : 'votes'} · tap an option to vote
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  question: {
    color: colors.ink,
  },
  options: {
    gap: 8,
  },
  optionRow: {
    height: 44,
  },
  optionTrack: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: colors.bg,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  optionFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.purpleSoft,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flexShrink: 1,
  },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#D6D2E0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioSelected: {
    borderColor: colors.purple,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.purple,
  },
  optionLabel: {
    color: colors.ink,
    flexShrink: 1,
  },
});

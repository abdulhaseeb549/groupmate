import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { colors, type } from '../../theme';
import { WrittenKind } from '../../state/writtenQuiz';

const TILES: { kind: WrittenKind; big: string | null; small: string }[] = [
  { kind: 'short', big: '2', small: 'marks' },
  { kind: 'medium', big: '5', small: 'marks' },
  { kind: 'long', big: '10', small: 'marks' },
  { kind: 'practical', big: null, small: 'Practical' },
];

/** "Questions like": pick any of 2, 5, 10 marks and Practical. One row of equal tiles. */
export function KindChips({ value, onChange }: { value: WrittenKind[]; onChange: (next: WrittenKind[]) => void }) {
  function toggle(kind: WrittenKind) {
    const on = value.includes(kind);
    // At least one kind stays picked: the last one can't be turned off.
    if (on && value.length === 1) return;
    onChange(on ? value.filter((k) => k !== kind) : [...value, kind]);
  }
  return (
    <View style={styles.row} accessibilityRole="none">
      {TILES.map(({ kind, big, small }) => {
        const on = value.includes(kind);
        const fg = on ? colors.purple : colors.ink;
        return (
          <Pressable
            key={kind}
            onPress={() => toggle(kind)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={big ? `${big} marks` : 'Practical'}
            style={({ pressed }) => [styles.tile, on && styles.tileOn, pressed && styles.pressed]}
          >
            {on ? (
              <View style={styles.tick}>
                <Icon name="check" size={10} color="#FFFFFF" strokeWidth={3.4} />
              </View>
            ) : null}
            {big ? (
              <Text style={[styles.big, { color: fg }]}>{big}</Text>
            ) : (
              <View style={styles.flask}>
                <Icon name="flask" size={22} color={fg} strokeWidth={1.8} />
              </View>
            )}
            <Text style={[styles.small, { color: on ? colors.purple : colors.muted }]}>{small}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOn: { backgroundColor: colors.purpleSoft, borderColor: colors.purple, borderWidth: 1.5 },
  pressed: { opacity: 0.7 },
  big: { fontFamily: type.pageTitle.fontFamily, fontSize: 22, lineHeight: 24 },
  flask: { height: 24, justifyContent: 'center' },
  small: { fontFamily: type.metadata.fontFamily, fontSize: 12, lineHeight: 16 },
  tick: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

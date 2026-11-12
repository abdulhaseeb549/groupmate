import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, type } from '../theme';

type Option<T extends string | number> = {
  value: T;
  label: string;
  /** Small mark before the label (e.g. signal bars). Receives whether this option is selected. */
  leading?: (selected: boolean) => ReactNode;
};

type Props<T extends string | number> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
};

/** A quiet track with the chosen option as a raised white chip. One choice of a few. */
export function Segmented<T extends string | number>({ options, value, onChange, label, disabled }: Props<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.track}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled }}
            style={[styles.option, selected && styles.selected]}
          >
            {option.leading ? option.leading(selected) : null}
            <Text style={[styles.text, { color: selected ? colors.ink : colors.muted }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(21,21,26,0.05)',
  },
  option: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  selected: {
    backgroundColor: colors.surface,
    shadowColor: '#1C1633',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  text: {
    fontFamily: type.button.fontFamily,
    fontSize: 15,
    lineHeight: 20,
  },
});

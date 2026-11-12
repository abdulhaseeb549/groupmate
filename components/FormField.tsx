import { ReactNode, useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, type } from '../theme';

type Props = TextInputProps & {
  label: string;
  /** Helper or status line under the field. */
  children?: ReactNode;
  inputStyle?: TextInputProps['style'];
};

/**
 * KIT .label over a .field: a 13/500 muted label, 8 above a 54-high white
 * field with a 1px #ECEAF0 ring that turns into the purple focus ring
 * (1.5px #6C4CE8 plus a 5px soft halo) while typing.
 */
export function FormField({ label, children, inputStyle, onFocus, onBlur, ...input }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.focus]}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.faint}
          selectionColor={colors.purple}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, inputStyle]}
        />
      </View>
      {children}
    </View>
  );
}

/** The same 54-high field shape for a value that can't be edited (Settings email). */
export function ReadOnlyField({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, styles.readOnly]}>
        <Text style={styles.readOnlyText} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  label: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  field: {
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.surface,
    boxShadow: '0 0 0 1px #ECEAF0',
    justifyContent: 'center',
  },
  focus: {
    boxShadow: '0 0 0 1.5px #6C4CE8, 0 0 0 5px rgba(108,76,232,0.12)',
  },
  input: {
    flex: 1,
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    borderRadius: 16,
    fontFamily: type.caption.fontFamily,
    fontSize: 16,
    color: colors.ink,
    // The ring is drawn by the wrapper; no browser focus outline on web.
    outlineWidth: 0,
  },
  readOnly: {
    backgroundColor: 'rgba(21,21,26,0.03)',
  },
  readOnlyText: {
    paddingHorizontal: 16,
    fontFamily: type.caption.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    color: colors.muted,
  },
});

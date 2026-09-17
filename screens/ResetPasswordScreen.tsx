import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { useAuth } from '../state/AuthProvider';
import { RecoveryStatus } from '../utils/passwordRecovery';
import { colors, layout, type } from '../theme';

type Props = {
  status: RecoveryStatus;
  /** Clears the recovery flag — AppShell then falls back to its normal session check: signed in with the new password if this succeeded, or the sign-in form if the link was invalid. */
  onDone: () => void;
};

/**
 * Shown instead of the normal signed-out/signed-in split while the app is
 * mid password-reset — tapping the emailed link already proved account
 * ownership and (usually) established a real session, so this is a
 * dedicated screen rather than a mode tucked inside AuthScreen: neither
 * "show the sign-in form" nor "drop straight into Home" is right for
 * someone who just followed a reset link.
 */
export function ResetPasswordScreen({ status, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = password.length >= 6 && password === confirm;

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      setDone(true);
    }
  }

  return (
    <KeyboardAvoider style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 32) + 40, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Icon name="document" size={26} color={colors.purple} strokeWidth={1.8} />
          </View>
          <Text style={[type.pageTitle, styles.ink]}>
            {status.state === 'error' ? 'Link expired' : done ? 'Password updated' : 'Set a new password'}
          </Text>
        </View>

        {status.state === 'verifying' ? (
          <View style={styles.centerRow}>
            <ActivityIndicator color={colors.purple} />
            <Text style={[type.body, styles.muted]}>Verifying your reset link…</Text>
          </View>
        ) : status.state === 'error' ? (
          <View style={styles.form}>
            <Text style={[type.body, styles.muted]}>{status.message}</Text>
            <Pressable
              onPress={onDone}
              accessibilityRole="button"
              style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
            >
              <Text style={[type.button, styles.submitLabel]}>Back to sign in</Text>
            </Pressable>
          </View>
        ) : done ? (
          <View style={styles.form}>
            <View style={styles.noticeBox}>
              <Icon name="check" size={16} color={colors.mintText} strokeWidth={2.4} />
              <Text style={[type.caption, styles.noticeText]}>
                Your password has been changed. You're signed in.
              </Text>
            </View>
            <Pressable
              onPress={onDone}
              accessibilityRole="button"
              style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
            >
              <Text style={[type.button, styles.submitLabel]}>Continue</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.form}>
            <Field label="New password">
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.faint}
                secureTextEntry
                autoComplete="new-password"
                style={styles.input}
              />
            </Field>

            <Field label="Confirm password">
              <TextInput
                value={confirm}
                onChangeText={setConfirm}
                placeholder="Type it again"
                placeholderTextColor={colors.faint}
                secureTextEntry
                autoComplete="new-password"
                style={styles.input}
              />
              {mismatch ? <Text style={[type.caption, styles.errorInline]}>Passwords don't match.</Text> : null}
            </Field>

            {error ? (
              <View style={styles.errorBox}>
                <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
                <Text style={[type.caption, styles.errorText]}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={submit}
              disabled={!canSubmit || submitting}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit || submitting }}
              style={({ pressed }) => [
                styles.submit,
                (!canSubmit || submitting) && styles.submitDisabled,
                pressed && canSubmit && !submitting && styles.submitPressed,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={colors.onInk} />
              ) : (
                <Text style={[type.button, styles.submitLabel]}>Set password</Text>
              )}
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoider>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={[type.metadata, styles.muted]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    justifyContent: 'center',
    gap: layout.sectionGap,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  brand: {
    alignItems: 'center',
    gap: 10,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  centerRow: {
    alignItems: 'center',
    gap: 12,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 6,
  },
  input: {
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.ink,
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
  },
  errorInline: {
    color: colors.redText,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.redSoft,
    borderRadius: 12,
    padding: 12,
  },
  errorText: {
    flex: 1,
    color: colors.redText,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.mint,
    borderRadius: 12,
    padding: 12,
  },
  noticeText: {
    flex: 1,
    color: colors.mintText,
  },
  submit: {
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitPressed: {
    opacity: 0.85,
  },
  submitLabel: {
    color: colors.onInk,
  },
});

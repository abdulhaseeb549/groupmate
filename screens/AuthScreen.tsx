import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../components/Icon';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthProvider';
import { colors, layout, type } from '../theme';

type Mode = 'signIn' | 'signUp';
type InviteLookup =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'found'; projectName: string }
  | { status: 'not_found' };

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLookup, setInviteLookup] = useState<InviteLookup>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState(false);

  const isSignUp = mode === 'signUp';
  const canSubmit =
    email.trim().length > 0 && password.length >= 6 && (!isSignUp || fullName.trim().length > 0);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSignedUp(false);
  }

  // Debounced preview — "You'll join {Project Name}" — so a mistyped code
  // is caught before submitting rather than only surfacing as a silent
  // fallback to a fresh demo project after signup.
  useEffect(() => {
    const code = inviteCode.trim().toUpperCase();
    if (!isSignUp || code.length === 0) {
      setInviteLookup({ status: 'idle' });
      return;
    }
    setInviteLookup({ status: 'checking' });
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase.rpc('lookup_invite_code', { code });
        if (cancelled) return;
        const projectName = data?.[0]?.project_name as string | undefined;
        setInviteLookup(projectName ? { status: 'found', projectName } : { status: 'not_found' });
      } catch {
        if (!cancelled) setInviteLookup({ status: 'not_found' });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [inviteCode, isSignUp]);

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = isSignUp
      ? await signUp(email.trim(), password, fullName.trim(), inviteCode.trim() || undefined)
      : await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else if (isSignUp) {
      // Sign-up without email confirmation logs the user straight in — with
      // it on, there's no session yet, so say so rather than looking stuck.
      setSignedUp(true);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
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
          <Text style={[type.pageTitle, styles.ink]}>GroupMate</Text>
          <Text style={[type.body, styles.muted, styles.tagline]}>
            Turn assignments into teamwork.
          </Text>
        </View>

        <View style={styles.tabs}>
          <ModeTab label="Sign in" active={mode === 'signIn'} onPress={() => switchMode('signIn')} />
          <ModeTab label="Create account" active={mode === 'signUp'} onPress={() => switchMode('signUp')} />
        </View>

        <View style={styles.form}>
          {isSignUp ? (
            <Field label="Your name">
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your full name"
                placeholderTextColor={colors.faint}
                autoCapitalize="words"
                autoComplete="name"
                style={styles.input}
              />
            </Field>
          ) : null}

          <Field label="Email">
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@university.edu"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={styles.input}
            />
          </Field>

          <Field label="Password">
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={isSignUp ? 'At least 6 characters' : '••••••••'}
              placeholderTextColor={colors.faint}
              secureTextEntry
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              style={styles.input}
            />
          </Field>

          {isSignUp ? (
            <Field label="Invite code (optional)">
              <TextInput
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="e.g. 7F3KQ9LP"
                placeholderTextColor={colors.faint}
                autoCapitalize="characters"
                autoCorrect={false}
                style={styles.input}
              />
              {inviteLookup.status === 'found' ? (
                <Text style={[type.caption, styles.inviteFound]}>
                  You'll join <Text style={styles.inviteFoundName}>{inviteLookup.projectName}</Text>
                </Text>
              ) : inviteLookup.status === 'not_found' ? (
                <Text style={[type.caption, styles.inviteNotFound]}>No project uses that code — check it and try again.</Text>
              ) : (
                <Text style={[type.caption, styles.muted]}>
                  Have a code from a teammate? Enter it to join their project instead of starting your own.
                </Text>
              )}
            </Field>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
              <Text style={[type.caption, styles.errorText]}>{error}</Text>
            </View>
          ) : null}

          {signedUp ? (
            <View style={styles.noticeBox}>
              <Icon name="check" size={16} color={colors.mintText} strokeWidth={2.4} />
              <Text style={[type.caption, styles.noticeText]}>
                Account created. Check your email to confirm it, then sign in.
              </Text>
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
              <Text style={[type.button, styles.submitLabel]}>
                {isSignUp ? 'Create account' : 'Sign in'}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      aria-selected={active}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[type.button, active ? styles.ink : styles.muted]}>{label}</Text>
    </Pressable>
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
    gap: 28,
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
  tagline: {
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 4,
  },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: colors.surface,
    shadowColor: '#1C1633',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
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
  inviteFound: {
    color: colors.muted,
  },
  inviteFoundName: {
    color: colors.mintText,
    fontFamily: type.metadata.fontFamily,
  },
  inviteNotFound: {
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

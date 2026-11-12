import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FadeIn } from '../components/FadeIn';
import { FormField as Field } from '../components/FormField';
import { Glow } from '../components/Glow';
import { GoogleMark } from '../components/GoogleMark';
import { GradientButton, WhiteButton } from '../components/GradientButton';
import { Icon } from '../components/Icon';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { isGoogleSignInEnabled, supabase } from '../lib/supabase';
import { useAuth } from '../state/AuthProvider';
import { colors, type } from '../theme';
import { useIncomingInviteCode } from '../utils/inviteLink';

type Mode = 'signIn' | 'signUp' | 'forgotPassword';
type InviteLookup =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'found'; projectName: string }
  | { status: 'not_found' };

/** GSignIn board. Sign in, Create account and Forgot password share one screen. */
export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [googleBusy, setGoogleBusy] = useState(false);
  // Hidden until the project confirms Google is actually switched on — the
  // button used to render unconditionally and error on every tap while the
  // provider was still disabled in Supabase.
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLookup, setInviteLookup] = useState<InviteLookup>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  // Opened from a shared invite link: jump to Create account with the code
  // already filled in, since joining is the only reason to follow one.
  const incomingCode = useIncomingInviteCode();
  useEffect(() => {
    if (!incomingCode) return;
    setInviteCode(incomingCode);
    setMode('signUp');
  }, [incomingCode]);

  useEffect(() => {
    let cancelled = false;
    void isGoogleSignInEnabled().then((enabled) => {
      if (!cancelled) setGoogleAvailable(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const isSignUp = mode === 'signUp';
  const isForgotPassword = mode === 'forgotPassword';
  const canSubmit = isForgotPassword
    ? email.trim().length > 0
    : email.trim().length > 0 && password.length >= 6 && (!isSignUp || fullName.trim().length > 0);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSignedUp(false);
    setResetSent(false);
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

  async function handleGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    setError(null);
    const result = await signInWithGoogle();
    setGoogleBusy(false);
    if (result.error) setError(result.error);
  }

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const result = isForgotPassword
      ? await resetPassword(email.trim())
      : isSignUp
        ? await signUp(email.trim(), password, fullName.trim(), inviteCode.trim() || undefined)
        : await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else if (isForgotPassword) {
      setResetSent(true);
    } else if (isSignUp) {
      // Sign-up without email confirmation logs the user straight in — with
      // it on, there's no session yet, so say so rather than looking stuck.
      setSignedUp(true);
    }
  }

  // Board .wash: a 60% x 55% ellipse at 50% 40% of a box that overhangs the
  // screen by 60 each side and 120 at the top, fading out at 70%.
  const washWidth = width + 120;

  return (
    <KeyboardAvoider style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 40) + 32, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Glow
          width={washWidth}
          height={420}
          cy={168}
          rx={washWidth * 0.6}
          ry={231}
          opacity={0.16}
          fadeAt={0.7}
          style={styles.wash}
        />

        <View style={styles.top}>
          <FadeIn>
            <View style={styles.brand}>
              <View style={styles.mark}>
                <Icon name="documentLines" size={28} color={colors.purple} strokeWidth={1.8} />
              </View>
              <View style={styles.brandText}>
                <Text style={styles.title} accessibilityRole="header">
                  GroupMate
                </Text>
                <Text style={styles.tagline}>Turn assignments into teamwork.</Text>
              </View>
            </View>
          </FadeIn>

          <FadeIn delay={60}>
            {isForgotPassword ? (
              <Pressable
                onPress={() => switchMode('signIn')}
                accessibilityRole="button"
                style={({ pressed }) => [styles.backRow, pressed && styles.pressed]}
              >
                <Icon name="back" size={18} color={colors.muted} strokeWidth={2} />
                <Text style={styles.backText}>Back to sign in</Text>
              </Pressable>
            ) : (
              <View style={styles.segs} accessibilityRole="tablist" accessibilityLabel="Account">
                <ModeTab label="Sign in" active={mode === 'signIn'} onPress={() => switchMode('signIn')} />
                <ModeTab label="Create account" active={mode === 'signUp'} onPress={() => switchMode('signUp')} />
              </View>
            )}
          </FadeIn>

          <FadeIn delay={120}>
            <View style={styles.form}>
              {isForgotPassword ? (
                <Text style={styles.helper}>
                  Enter your account email and we'll send you a link to set a new password.
                </Text>
              ) : null}

              {isSignUp ? (
                <Field
                  label="Your name"
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="Your full name"
                  autoCapitalize="words"
                  autoComplete="name"
                />
              ) : null}

              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@university.edu"
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
              />

              {isForgotPassword ? null : (
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={isSignUp ? 'At least 6 characters' : '••••••••'}
                  secureTextEntry
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  // Board: the masked dots sit at 18px with 3px tracking.
                  inputStyle={password.length > 0 ? styles.dots : undefined}
                />
              )}

              {mode === 'signIn' ? (
                <Pressable
                  onPress={() => switchMode('forgotPassword')}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.forgot, pressed && styles.pressed]}
                >
                  <Text style={styles.link}>Forgot password?</Text>
                </Pressable>
              ) : null}

              {isSignUp ? (
                <Field
                  label="Invite code (optional)"
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  placeholder="e.g. 7F3KQ9LP"
                  autoCapitalize="characters"
                  autoCorrect={false}
                >
                  {inviteLookup.status === 'found' ? (
                    <Text style={styles.m}>
                      You'll join <Text style={styles.foundName}>{inviteLookup.projectName}</Text>
                    </Text>
                  ) : inviteLookup.status === 'not_found' ? (
                    <Text style={[styles.m, styles.coral]}>No project uses that code — check it and try again.</Text>
                  ) : (
                    <Text style={styles.m}>
                      Have a code from a teammate? Enter it to join their project instead of starting your own.
                    </Text>
                  )}
                </Field>
              ) : null}

              {error ? (
                <FadeIn>
                  <View style={styles.errorBox}>
                    <Icon name="exclamation" size={18} color={colors.redText} strokeWidth={2.2} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                </FadeIn>
              ) : null}

              {signedUp ? (
                <FadeIn>
                  <View style={styles.noticeBox}>
                    <Icon name="joined" size={18} color={colors.mintText} strokeWidth={2.2} />
                    <Text style={styles.noticeText}>Account created. Check your email to confirm it, then sign in.</Text>
                  </View>
                </FadeIn>
              ) : null}

              {resetSent ? (
                <FadeIn>
                  <View style={styles.noticeBox}>
                    <Icon name="joined" size={18} color={colors.mintText} strokeWidth={2.2} />
                    <Text style={styles.noticeText}>If that email has an account, a reset link is on its way.</Text>
                  </View>
                </FadeIn>
              ) : null}
            </View>
          </FadeIn>
        </View>

        <View style={styles.spacer} />

        <FadeIn delay={180}>
          <View style={styles.bottom}>
            <GradientButton
              label={isForgotPassword ? 'Send reset link' : isSignUp ? 'Create account' : 'Sign in'}
              onPress={submit}
              disabled={!canSubmit}
              loading={submitting}
            />

            {googleAvailable && !isForgotPassword ? (
              <>
                <View style={styles.or} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>or</Text>
                  <View style={styles.orLine} />
                </View>
                <WhiteButton
                  label="Continue with Google"
                  onPress={handleGoogle}
                  loading={googleBusy}
                  leading={<GoogleMark size={18} />}
                />
              </>
            ) : null}
          </View>
        </FadeIn>
      </ScrollView>
    </KeyboardAvoider>
  );
}

function ModeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      aria-selected={active}
      style={({ pressed }) => [styles.seg, active && styles.segOn, pressed && !active && styles.pressed]}
    >
      <Text style={[styles.segText, active && styles.segTextOn]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  wash: {
    position: 'absolute',
    left: -60,
    top: -120,
  },
  pressed: {
    opacity: 0.6,
  },
  top: {
    gap: 32,
  },
  spacer: {
    flex: 1,
    minHeight: 32,
  },
  // Brand: 60 white tile, 14 gap, Cabinet 34/38 and a 15/21 muted line.
  brand: {
    alignItems: 'center',
    gap: 14,
  },
  mark: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 10px 26px rgba(88,54,214,0.16), 0 0 0 0.5px rgba(17,17,17,0.06)',
  },
  brandText: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.9,
    color: colors.ink,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: type.caption.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
  // KIT .segs / .seg / .seg.on
  segs: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 16,
    backgroundColor: 'rgba(21,21,26,0.05)',
  },
  seg: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segOn: {
    backgroundColor: colors.surface,
    boxShadow: '0 2px 8px rgba(28,22,51,0.08), 0 0 0 0.5px rgba(17,17,17,0.06)',
  },
  segText: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.muted,
  },
  segTextOn: {
    fontFamily: type.button.fontFamily,
    color: colors.ink,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 44,
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: type.button.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  form: {
    gap: 16,
  },
  helper: {
    fontFamily: type.caption.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
  },
  dots: {
    fontSize: 18,
    letterSpacing: 3,
  },
  // KIT .link, right-aligned 10 under the password field.
  forgot: {
    alignSelf: 'flex-end',
    height: 44,
    justifyContent: 'center',
    marginTop: -6,
  },
  link: {
    fontFamily: type.button.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.purple,
  },
  m: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  coral: {
    color: colors.redText,
  },
  foundName: {
    fontFamily: type.taskTitle.fontFamily,
    color: colors.mintText,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.redSoft,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  errorText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.redText,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.mint,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  noticeText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.mintText,
  },
  bottom: {
    gap: 16,
  },
  // Board .or: 13px faint "or" between two .5 #DCD8E3 rules, 12 apart.
  or: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  orLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: '#DCD8E3',
  },
  orText: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.faint,
  },
});

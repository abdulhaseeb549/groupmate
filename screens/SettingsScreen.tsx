import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../components/Avatar';
import { Card, CardDivider } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { useAuth } from '../state/AuthProvider';
import { useNavigation } from '../state/NavigationProvider';
import { colors, layout, radius, type } from '../theme';
import { useHardwareBackHandler } from '../utils/hardwareBack';

type SettingsView = 'list' | 'profile' | 'password';

const ROW_DIVIDER_INSET = 16;

/**
 * Reached by tapping the avatar on Home (previously a straight sign-out
 * confirm — Log Out now lives here as one row among others, which is also
 * why the sign-out dialog moved from HomeScreen to here). A local `view`
 * stack, not three routed screens, since it's exactly two levels deep and
 * every other multi-step flow in this app (Study, Chat) already does the
 * same rather than reaching for real navigation.
 */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { closeSettings } = useNavigation();
  const [view, setView] = useState<SettingsView>('list');

  useHardwareBackHandler(() => (view === 'list' ? closeSettings() : setView('list')));

  return (
    <KeyboardAvoider style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 32) + 14, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => (view === 'list' ? closeSettings() : setView('list'))}
            accessibilityRole="button"
            accessibilityLabel={view === 'list' ? 'Close' : 'Back'}
            style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
          >
            <Icon
              name={view === 'list' ? 'chevronDown' : 'chevronLeft'}
              size={20}
              color={colors.ink}
              strokeWidth={2}
            />
          </Pressable>
          {view !== 'list' ? (
            <Text style={[type.projectTitle, styles.ink]}>
              {view === 'profile' ? 'My Profile' : 'Change Password'}
            </Text>
          ) : null}
        </View>

        {view === 'list' ? (
          <SettingsList onOpenProfile={() => setView('profile')} onOpenPassword={() => setView('password')} />
        ) : view === 'profile' ? (
          <ProfileView />
        ) : (
          <ChangePasswordView />
        )}
      </ScrollView>
    </KeyboardAvoider>
  );
}

function SettingsList({ onOpenProfile, onOpenPassword }: { onOpenProfile: () => void; onOpenPassword: () => void }) {
  const { session, profile, signOut } = useAuth();
  const [signOutVisible, setSignOutVisible] = useState(false);

  return (
    <>
      <Text style={[type.pageTitle, styles.ink, styles.title]}>Settings</Text>

      <Card style={styles.profileCard}>
        <Avatar
          initials={profile?.initials ?? '··'}
          bg={profile?.avatarBg ?? colors.purpleSoft}
          fg={profile?.avatarFg ?? colors.purple}
          size={52}
        />
        <View style={styles.profileText}>
          <Text style={[type.projectTitle, styles.ink]} numberOfLines={1}>
            {profile?.fullName ?? 'Loading…'}
          </Text>
          <Text style={[type.body, styles.muted]} numberOfLines={1}>
            {session?.user.email}
          </Text>
        </View>
      </Card>

      <Card>
        <SettingsRow label="Profile" onPress={onOpenProfile} />
        <CardDivider inset={ROW_DIVIDER_INSET} />
        <SettingsRow label="Change Password" onPress={onOpenPassword} />
      </Card>

      <Card>
        <SettingsRow label="Log Out" destructive onPress={() => setSignOutVisible(true)} />
      </Card>

      <ConfirmDialog
        visible={signOutVisible}
        title="Sign out"
        message={session?.user.email ? `Signed in as ${session.user.email}` : undefined}
        confirmLabel="Sign out"
        destructive
        onConfirm={() => {
          setSignOutVisible(false);
          void signOut();
        }}
        onCancel={() => setSignOutVisible(false)}
      />
    </>
  );
}

function SettingsRow({ label, onPress, destructive }: { label: string; onPress: () => void; destructive?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={[type.body, destructive ? styles.destructive : styles.ink, styles.rowLabel]}>{label}</Text>
      <Icon name="chevronRight" size={18} color={destructive ? colors.redText : colors.faint} strokeWidth={2} />
    </Pressable>
  );
}

function ProfileView() {
  const { session, profile, updateProfile } = useAuth();
  const [name, setName] = useState(profile?.fullName ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSubmit = name.trim().length > 0 && name.trim() !== profile?.fullName;

  async function submit() {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setSaved(false);
    const result = await updateProfile(name);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSaved(true);
    }
  }

  return (
    <View style={styles.form}>
      <View style={styles.avatarRow}>
        <Avatar
          initials={profile?.initials ?? '··'}
          bg={profile?.avatarBg ?? colors.purpleSoft}
          fg={profile?.avatarFg ?? colors.purple}
          size={88}
        />
      </View>

      <Field label="Name">
        <TextInput
          value={name}
          onChangeText={(next) => {
            setName(next);
            setSaved(false);
          }}
          placeholder="Your full name"
          placeholderTextColor={colors.faint}
          autoCapitalize="words"
          style={styles.input}
        />
      </Field>

      <Field label="Email">
        <View style={[styles.input, styles.inputDisabled]}>
          <Text style={[type.body, styles.muted]} numberOfLines={1}>
            {session?.user.email}
          </Text>
        </View>
        <Text style={[type.caption, styles.muted]}>Email can't be changed here.</Text>
      </Field>

      {error ? (
        <View style={styles.errorBox}>
          <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
          <Text style={[type.caption, styles.errorText]}>{error}</Text>
        </View>
      ) : null}

      {saved ? (
        <View style={styles.noticeBox}>
          <Icon name="check" size={16} color={colors.mintText} strokeWidth={2.4} />
          <Text style={[type.caption, styles.noticeText]}>Profile updated.</Text>
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
          <Text style={[type.button, styles.submitLabel]}>Save</Text>
        )}
      </Pressable>
    </View>
  );
}

function ChangePasswordView() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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
      setSaved(true);
      setPassword('');
      setConfirm('');
    }
  }

  return (
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

      {saved ? (
        <View style={styles.noticeBox}>
          <Icon name="check" size={16} color={colors.mintText} strokeWidth={2.4} />
          <Text style={[type.caption, styles.noticeText]}>Password changed.</Text>
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
          <Text style={[type.button, styles.submitLabel]}>Save</Text>
        )}
      </Pressable>
    </View>
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
    paddingHorizontal: layout.screenPadding,
    gap: layout.sectionGap,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  destructive: {
    color: colors.redText,
  },
  title: {
    marginTop: -8,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: layout.cardPaddingLg,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  rowLabel: {
    flex: 1,
  },
  form: {
    gap: 16,
  },
  avatarRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  field: {
    gap: 6,
  },
  input: {
    height: 50,
    borderRadius: radius.control,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.ink,
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    justifyContent: 'center',
  },
  inputDisabled: {
    backgroundColor: colors.surfaceMuted,
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
    borderRadius: radius.control,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
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

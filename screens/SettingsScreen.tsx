import { ReactNode, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FadeIn } from '../components/FadeIn';
import { FormField, ReadOnlyField } from '../components/FormField';
import { GlassButton } from '../components/Glass';
import { GradientButton } from '../components/GradientButton';
import { Icon, IconName } from '../components/Icon';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { useAuth } from '../state/AuthProvider';
import { useNavigation } from '../state/NavigationProvider';
import { colors, type } from '../theme';
import { useHardwareBackHandler } from '../utils/hardwareBack';

type SettingsView = 'list' | 'profile' | 'password';

/**
 * GSettings board. Reached by tapping the avatar on Home (previously a
 * straight sign-out confirm — Log out now lives here as one row among
 * others, which is also why the sign-out dialog moved from HomeScreen to
 * here). A local `view` stack, not three routed screens, since it's exactly
 * two levels deep and every other multi-step flow in this app (Study, Chat)
 * already does the same rather than reaching for real navigation.
 */
export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { closeSettings } = useNavigation();
  const [view, setView] = useState<SettingsView>('list');

  useHardwareBackHandler(() => (view === 'list' ? closeSettings() : setView('list')));

  return (
    <KeyboardAvoider style={styles.screen}>
      <ScrollView
        key={view}
        contentContainerStyle={[
          styles.content,
          { paddingTop: Math.max(insets.top, 40) + 6, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
          <GlassButton
            label={view === 'list' ? 'Close' : 'Back'}
            onPress={() => (view === 'list' ? closeSettings() : setView('list'))}
          >
            <Icon name={view === 'list' ? 'close' : 'back'} size={20} color={colors.ink} strokeWidth={2} />
          </GlassButton>
        </FadeIn>

        <FadeIn delay={40}>
          <Text style={styles.h1} accessibilityRole="header">
            {view === 'list' ? 'Settings' : view === 'profile' ? 'My Profile' : 'Change Password'}
          </Text>
        </FadeIn>

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

/** Initials in a circle, sized by the board (56 → 18/600). */
function Initials({ size }: { size: number }) {
  const { profile } = useAuth();
  return (
    <View
      style={[
        styles.initials,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: profile?.avatarBg ?? colors.purpleSoft,
        },
      ]}
    >
      <Text
        style={[
          styles.initialsText,
          { color: profile?.avatarFg ?? colors.purple, fontSize: Math.round(size * 0.32), lineHeight: Math.round(size * 0.44) },
        ]}
      >
        {profile?.initials ?? '··'}
      </Text>
    </View>
  );
}

function SettingsList({ onOpenProfile, onOpenPassword }: { onOpenProfile: () => void; onOpenPassword: () => void }) {
  const { session, profile, signOut } = useAuth();
  const [signOutVisible, setSignOutVisible] = useState(false);

  return (
    <>
      <FadeIn delay={80}>
        <View style={styles.who}>
          <Initials size={56} />
          <View style={styles.whoText}>
            <Text style={styles.lead} numberOfLines={1}>
              {profile?.fullName ?? 'Loading…'}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {session?.user.email}
            </Text>
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={120}>
        <View style={styles.section}>
          <Text style={styles.eyebrow}>Account</Text>
          <View style={styles.list}>
            <Item icon="person" label="Profile" onPress={onOpenProfile} />
            <View style={styles.hair} />
            <Item icon="lock" label="Password" onPress={onOpenPassword} />
          </View>
        </View>
      </FadeIn>

      <FadeIn delay={160}>
        <View style={styles.list}>
          <Item icon="logout" label="Log out" destructive onPress={() => setSignOutVisible(true)} />
        </View>
      </FadeIn>

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

/** Board .item: 56 high, a 22-wide muted icon column, 16/500 label, a faint chevron (none on Log out). */
function Item({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const tint = destructive ? colors.redText : colors.muted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <View style={styles.itemIcon}>
        <Icon name={icon} size={20} color={tint} strokeWidth={1.7} />
      </View>
      <Text style={[styles.itemLabel, destructive ? styles.coral : styles.flex]}>{label}</Text>
      {destructive ? null : <Icon name="next" size={16} color={colors.faint} strokeWidth={2} />}
    </Pressable>
  );
}

function Notice({ tone, children }: { tone: 'good' | 'bad'; children: ReactNode }) {
  const good = tone === 'good';
  return (
    <FadeIn>
      <View style={[styles.notice, { backgroundColor: good ? colors.mint : colors.redSoft }]}>
        <Icon
          name={good ? 'joined' : 'exclamation'}
          size={18}
          color={good ? colors.mintText : colors.redText}
          strokeWidth={2.2}
        />
        <Text style={[styles.noticeText, { color: good ? colors.mintText : colors.redText }]}>{children}</Text>
      </View>
    </FadeIn>
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
    <FadeIn delay={80}>
      <View style={styles.form}>
        <View style={styles.avatarRow}>
          <Initials size={88} />
        </View>

        <FormField
          label="Name"
          value={name}
          onChangeText={(next) => {
            setName(next);
            setSaved(false);
          }}
          placeholder="Your full name"
          autoCapitalize="words"
        />

        <ReadOnlyField label="Email" value={session?.user.email}>
          <Text style={styles.m}>Email can't be changed here.</Text>
        </ReadOnlyField>

        {error ? <Notice tone="bad">{error}</Notice> : null}
        {saved ? <Notice tone="good">Profile updated.</Notice> : null}

        <GradientButton label="Save" onPress={submit} disabled={!canSubmit} loading={submitting} style={styles.save} />
      </View>
    </FadeIn>
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
    <FadeIn delay={80}>
      <View style={styles.form}>
        <FormField
          label="New password"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          secureTextEntry
          autoComplete="new-password"
          inputStyle={password.length > 0 ? styles.dots : undefined}
        />

        <FormField
          label="Confirm password"
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Type it again"
          secureTextEntry
          autoComplete="new-password"
          inputStyle={confirm.length > 0 ? styles.dots : undefined}
        >
          {mismatch ? <Text style={[styles.m, styles.coral]}>Passwords don't match.</Text> : null}
        </FormField>

        {error ? <Notice tone="bad">{error}</Notice> : null}
        {saved ? <Notice tone="good">Password changed.</Notice> : null}

        <GradientButton label="Save" onPress={submit} disabled={!canSubmit} loading={submitting} style={styles.save} />
      </View>
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Board: padding 20 20 0, 24 between the close button, title and sections.
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  flex: {
    flex: 1,
  },
  h1: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  who: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  whoText: {
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
  },
  initials: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontFamily: type.button.fontFamily,
  },
  lead: {
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: colors.ink,
  },
  email: {
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  section: {
    gap: 10,
  },
  eyebrow: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
    paddingLeft: 4,
  },
  // Board .list: one white 20-radius block per group, a .5 hairline ring, no shadow.
  list: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0 0 0 0.5px rgba(17,17,17,0.07)',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    height: 56,
    paddingHorizontal: 16,
  },
  itemPressed: {
    backgroundColor: 'rgba(21,21,26,0.04)',
  },
  itemIcon: {
    width: 22,
    alignItems: 'center',
  },
  itemLabel: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  coral: {
    color: colors.redText,
  },
  hair: {
    height: 0.5,
    backgroundColor: colors.border,
    marginLeft: 52,
  },
  m: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  form: {
    gap: 16,
  },
  avatarRow: {
    alignItems: 'center',
    marginBottom: 4,
  },
  dots: {
    fontSize: 18,
    letterSpacing: 3,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  noticeText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  },
  save: {
    marginTop: 8,
  },
});

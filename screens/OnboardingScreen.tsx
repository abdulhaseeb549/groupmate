import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AttachRow } from '../components/AttachRow';
import { BottomNav, NavTab } from '../components/BottomNav';
import { BriefReview } from '../components/BriefReview';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { supabase } from '../lib/supabase';
import { commitExtractedProject, ExtractedProjectData, parseBrief } from '../state/briefParsing';
import { useAuth } from '../state/AuthProvider';
import { joinProjectByCode } from '../state/projectQueries';
import { colors, layout, type } from '../theme';
import { useIncomingInviteCode } from '../utils/inviteLink';
import { pickPdf, PdfFileInput } from '../utils/pdfPicker';

const MIN_LENGTH = 40;
type Mode = 'intro' | 'create' | 'join';
type CreatePhase = 'input' | 'loading' | 'review' | 'committing';
type InviteLookup =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'found'; projectName: string }
  | { status: 'not_found' };

type Props = {
  /** Called after a project is successfully created or joined — the caller re-fetches, which naturally replaces this screen once a project exists. */
  onDone: () => void;
  /** Supplied by NoProjectShell: the intro is the Home tab of the no-project state, so it carries the tab bar like any other tab. Omit both to render it standalone. */
  activeTab?: NavTab;
  onSelectTab?: (tab: NavTab) => void;
  /** Opens straight into create or join — used by the "+" menu, which has no NewProjectScreen to fall back on before a project exists. */
  startMode?: Mode;
  /** Called when one of those forced modes is backed out of, so the shell can drop the request that opened it. */
  onExitMode?: () => void;
};

/**
 * What a signed-in user with zero projects sees — a real empty state, not
 * a demo dressed up as one (signup no longer auto-seeds a project; see
 * migration 0016). Two ways in: read a brief into a brand-new project, or
 * join a teammate's with their invite code.
 */
export function OnboardingScreen({ onDone, activeTab, onSelectTab, startMode, onExitMode }: Props) {
  const insets = useSafeAreaInsets();
  const { profile, session, signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('intro');
  const [signOutVisible, setSignOutVisible] = useState(false);
  // Someone already signed in who taps an invite link goes straight to the
  // join step rather than landing on the hero and hunting for the button.
  const incomingCode = useIncomingInviteCode();
  useEffect(() => {
    if (incomingCode) setMode('join');
  }, [incomingCode]);
  useEffect(() => {
    if (startMode) setMode(startMode);
  }, [startMode]);

  function backToIntro() {
    setMode('intro');
    onExitMode?.();
  }
  const initials = profile?.initials ?? '··';
  const firstName = (profile?.fullName ?? session?.user.email?.split('@')[0] ?? '').split(' ')[0];

  if (mode === 'create') {
    return <CreateProjectFlow onBack={backToIntro} onDone={onDone} />;
  }
  if (mode === 'join') {
    return <JoinProjectFlow onBack={backToIntro} onDone={onDone} initialCode={incomingCode ?? undefined} />;
  }

  const hasNav = activeTab !== undefined && onSelectTab !== undefined;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: Math.max(insets.top, 32) + 14,
            paddingBottom: (hasNav ? 130 : 40) + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}>
              <Icon name="document" size={16} color={colors.purple} strokeWidth={1.8} />
            </View>
            <Text style={[type.button, styles.ink]}>GroupMate</Text>
          </View>
          <Pressable
            onPress={() => setSignOutVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Account, sign out"
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
          >
            <Text style={[type.avatarInitials, styles.avatarText]}>{initials}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <Text style={[type.pageTitle, styles.ink]} accessibilityRole="header">
            {firstName ? `Hi ${firstName}. ` : ''}Turn your assignment into a <Text style={styles.purple}>clear plan</Text>.
          </Text>
          <Text style={[type.body, styles.muted]}>
            Paste your brief or drop the PDF — GroupMate finds the requirements and turns them into tasks your team
            can claim.
          </Text>
        </View>

        <Card>
          <View style={styles.briefCard}>
            <View style={styles.briefTop}>
              <View style={styles.briefText}>
                <Text style={[type.projectTitle, styles.ink]}>Add your project brief</Text>
                <Text style={[type.caption, styles.muted]}>PDF, doc, or pasted text</Text>
              </View>
              <Image
                source={require('../assets/Mascot-png.png')}
                style={styles.briefMascot}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
            <Pressable
              onPress={() => setMode('create')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
            >
              <Text style={[type.button, styles.onInk]}>Create project</Text>
              <Icon name="chevronRight" size={16} color={colors.onInk} strokeWidth={2.2} />
            </Pressable>
          </View>
        </Card>

        <Pressable
          onPress={() => setMode('join')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Icon name="users" size={16} color={colors.purple} strokeWidth={1.8} />
          <Text style={[type.button, styles.purple]}>Join a project</Text>
        </Pressable>

        {/* Study needs notes, not a project — StudyScreen never touched
            useProject(). The card here used to advertise it as "unlocks
            once your project exists", which wasn't true, and it wasn't
            pressable either. */}
        {hasNav ? (
          <Pressable
            onPress={() => onSelectTab('study')}
            accessibilityRole="button"
            style={({ pressed }) => [styles.studyCard, pressed && styles.pressed]}
          >
            <View style={styles.studyIconTile}>
              <Icon name="book" size={20} color={colors.yellowText} strokeWidth={1.8} />
            </View>
            <View style={styles.studyText}>
              <Text style={[type.taskTitle, styles.ink]}>Make a practice quiz</Text>
              <Text style={[type.caption, styles.muted]}>
                From your notes or a PDF — no project needed.
              </Text>
            </View>
            <Icon name="chevronRight" size={16} color={colors.faint} strokeWidth={2} />
          </Pressable>
        ) : null}

        <Text style={[type.caption, styles.tip]}>
          Split work by section, not by hours — it's easier to claim.
        </Text>
      </ScrollView>

      {hasNav ? <BottomNav active={activeTab} onSelect={onSelectTab} canInvite={false} /> : null}

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
    </View>
  );
}

/** The "Create project" path — same read-a-brief flow as replacing one from NewProjectScreen, minus the destructive-replace framing (there's nothing to replace yet), landing straight in the new project once built. */
function CreateProjectFlow({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<CreatePhase>('input');
  const [briefText, setBriefText] = useState('');
  const [briefFile, setBriefFile] = useState<PdfFileInput | null>(null);
  const [syllabusFile, setSyllabusFile] = useState<PdfFileInput | null>(null);
  const [extracted, setExtracted] = useState<ExtractedProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = briefText.trim().length >= MIN_LENGTH || briefFile !== null;
  const busy = phase === 'loading' || phase === 'committing';

  async function pickFile(kind: 'brief' | 'syllabus') {
    const { file, error: pickError } = await pickPdf();
    if (pickError) {
      setError(pickError);
      return;
    }
    if (!file) return;
    setError(null);
    if (kind === 'brief') setBriefFile(file);
    else setSyllabusFile(file);
  }

  async function readBrief() {
    setPhase('loading');
    setError(null);
    const result = await parseBrief({
      briefText: briefText.trim() || undefined,
      briefFile: briefFile ?? undefined,
      syllabusFile: syllabusFile ?? undefined,
    });
    if (result.error) {
      setError(result.error);
      setPhase('input');
      return;
    }
    setExtracted(result.extracted);
    setPhase('review');
  }

  async function build() {
    if (!extracted) return;
    setPhase('committing');
    const result = await commitExtractedProject(extracted);
    if (result.error) {
      setError(result.error);
      setPhase('review');
      return;
    }
    onDone();
  }

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
            onPress={onBack}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Icon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2} />
          </Pressable>
        </View>

        {(phase === 'review' || phase === 'committing') && extracted ? (
          <BriefReview
            extracted={extracted}
            today={new Date()}
            error={error}
            committing={phase === 'committing'}
            buildLabel="Create my project →"
            onStartOver={() => {
              setExtracted(null);
              setError(null);
              setPhase('input');
            }}
            onBuildPlan={build}
          />
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={[type.pageTitle, styles.ink]}>Drop the brief.</Text>
              <Text style={[type.pageTitle, styles.ink]}>
                I'll <Text style={styles.purple}>read it.</Text>
              </Text>
              <Text style={[type.body, styles.muted, styles.subtitle]}>
                Paste the brief or attach it as a PDF. I'll find the requirements and turn them into tasks — you'll
                see the plan before anything's created.
              </Text>
            </View>

            <TextInput
              value={briefText}
              onChangeText={setBriefText}
              placeholder="Paste the full assignment text here…"
              placeholderTextColor={colors.faint}
              multiline
              textAlignVertical="top"
              editable={phase !== 'loading'}
              style={styles.textArea}
            />

            <View style={styles.attachSection}>
              <AttachRow
                label="Attach brief PDF instead"
                file={briefFile}
                onAttach={() => pickFile('brief')}
                onRemove={() => setBriefFile(null)}
                disabled={phase === 'loading'}
              />
              <AttachRow
                label="Add syllabus (optional)"
                file={syllabusFile}
                onAttach={() => pickFile('syllabus')}
                onRemove={() => setSyllabusFile(null)}
                disabled={phase === 'loading'}
              />
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
                <Text style={[type.caption, styles.errorText]}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={readBrief}
              disabled={!canSubmit || phase === 'loading'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit || phase === 'loading' }}
              style={({ pressed }) => [
                styles.submit,
                (!canSubmit || phase === 'loading') && styles.submitDisabled,
                pressed && canSubmit && phase !== 'loading' && styles.submitPressed,
              ]}
            >
              {phase === 'loading' ? (
                <>
                  <ActivityIndicator color={colors.onInk} />
                  <Text style={[type.button, styles.onInk]}>Reading your brief…</Text>
                </>
              ) : (
                <Text style={[type.button, styles.onInk]}>Read my brief →</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoider>
  );
}

/** The "Join a project" path — an invite code, previewed before submitting, then a security-definer RPC join (see migration 0016). */
function JoinProjectFlow({
  onBack,
  onDone,
  initialCode,
}: {
  onBack: () => void;
  onDone: () => void;
  /** Prefilled when the app was opened from an invite link. */
  initialCode?: string;
}) {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState(initialCode ?? '');
  const [lookup, setLookup] = useState<InviteLookup>({ status: 'idle' });
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 0) {
      setLookup({ status: 'idle' });
      return;
    }
    setLookup({ status: 'checking' });
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data } = await supabase.rpc('lookup_invite_code', { code: trimmed });
        if (cancelled) return;
        const projectName = data?.[0]?.project_name as string | undefined;
        setLookup(projectName ? { status: 'found', projectName } : { status: 'not_found' });
      } catch {
        if (!cancelled) setLookup({ status: 'not_found' });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code]);

  async function submit() {
    if (code.trim().length === 0 || joining) return;
    setJoining(true);
    setError(null);
    try {
      await joinProjectByCode(code.trim());
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join that project.');
      setJoining(false);
    }
  }

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
            onPress={onBack}
            disabled={joining}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Icon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.intro}>
          <Text style={[type.pageTitle, styles.ink]}>Join a project.</Text>
          <Text style={[type.body, styles.muted, styles.subtitle]}>
            Enter the invite code a teammate shared with you.
          </Text>
        </View>

        <View style={styles.field}>
          <Text style={[type.metadata, styles.eyebrow]}>INVITE CODE</Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder="e.g. 7F3KQ9LP"
            placeholderTextColor={colors.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!joining}
            style={styles.codeInput}
          />
          {lookup.status === 'found' ? (
            <Text style={[type.caption, styles.foundText]}>
              You'll join <Text style={styles.foundName}>{lookup.projectName}</Text>
            </Text>
          ) : lookup.status === 'not_found' ? (
            <Text style={[type.caption, styles.errorText]}>No project uses that code — check it and try again.</Text>
          ) : null}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
            <Text style={[type.caption, styles.errorText]}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={code.trim().length === 0 || joining}
          accessibilityRole="button"
          accessibilityState={{ disabled: code.trim().length === 0 || joining }}
          style={({ pressed }) => [
            styles.submit,
            (code.trim().length === 0 || joining) && styles.submitDisabled,
            pressed && code.trim().length > 0 && !joining && styles.submitPressed,
          ]}
        >
          {joining ? (
            <>
              <ActivityIndicator color={colors.onInk} />
              <Text style={[type.button, styles.onInk]}>Joining…</Text>
            </>
          ) : (
            <Text style={[type.button, styles.onInk]}>Join project</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    gap: 22,
  },
  ink: {
    color: colors.ink,
  },
  muted: {
    color: colors.muted,
  },
  purple: {
    color: colors.purple,
  },
  onInk: {
    color: colors.onInk,
  },
  eyebrow: {
    color: colors.muted,
    letterSpacing: 0.4,
  },
  pressed: {
    opacity: 0.6,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: layout.avatarHeader,
    height: layout.avatarHeader,
    borderRadius: layout.avatarHeader / 2,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.purple,
    fontSize: 15,
    lineHeight: 20,
  },
  hero: {
    gap: 10,
  },
  briefCard: {
    padding: 18,
    gap: 4,
  },
  briefTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  briefText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  // The home hero's 1.2:1 source ratio, sized to sit beside two lines of
  // text without pushing them onto three.
  briefMascot: {
    width: 74,
    height: 74 / 1.2,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.purple,
    marginTop: 14,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  studyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
  },
  // Yellow, not purple: purple stays on the one primary action on this
  // screen, and this matches the "+" menu's Study tile.
  studyIconTile: {
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: layout.iconTileRadius,
    backgroundColor: colors.yellowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studyText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tip: {
    color: colors.muted,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  header: {
    flexDirection: 'row',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: {
    gap: 8,
  },
  subtitle: {
    marginTop: 4,
  },
  textArea: {
    minHeight: 220,
    borderRadius: 18,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    color: colors.ink,
    fontFamily: type.body.fontFamily,
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
  },
  attachSection: {
    gap: 8,
  },
  field: {
    gap: 6,
  },
  codeInput: {
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
  foundText: {
    color: colors.muted,
  },
  foundName: {
    color: colors.mintText,
    fontFamily: type.metadata.fontFamily,
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
  submit: {
    flexDirection: 'row',
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  submitDisabled: {
    opacity: 0.5,
  },
  submitPressed: {
    opacity: 0.85,
  },
});

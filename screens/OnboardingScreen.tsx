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
import { FadeIn } from '../components/FadeIn';
import { GlassButton, GlassScene, GlassTarget } from '../components/Glass';
import { Glow } from '../components/Glow';
import { BriefReview } from '../components/BriefReview';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { GradientButton, WhiteButton } from '../components/GradientButton';
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
 * join a teammate's with their invite code. Intro = GOnboarding board,
 * join = GOnboarding2.
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
    <GlassScene style={styles.screen}>
      <GlassTarget>
      <ScrollView
        contentContainerStyle={[
          s.introContent,
          {
            paddingTop: Math.max(insets.top, 40) + 14,
            paddingBottom: (hasNav ? 120 : 40) + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
          <View style={s.topRow}>
            <Pressable
              onPress={() => setSignOutVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Account, sign out"
              style={({ pressed }) => [s.avatar, pressed && s.pressed]}
            >
              <Text style={s.avatarText}>{initials}</Text>
            </Pressable>
            <View style={s.greeting}>
              <Text style={s.eyebrow}>Welcome</Text>
              <Text style={s.hi} numberOfLines={1}>
                {firstName ? `Hi, ${firstName}` : 'Hi'}
              </Text>
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={60}>
          <View style={s.hero}>
            <View style={s.mascotBox}>
              <Glow width={260} height={200} opacity={0.2} style={s.glow} />
              <Image
                source={require('../assets/Mascot-png.png')}
                style={s.mascot}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
            </View>
            <View style={s.heroText}>
              <Text style={s.heroTitle} accessibilityRole="header">
                {'Your brief,\nas a clear plan'}
              </Text>
              <Text style={s.sub}>Drop the PDF or paste the text.</Text>
            </View>
          </View>
        </FadeIn>

        <FadeIn delay={120}>
          <View style={s.actions}>
            <GradientButton
              label="Create project"
              onPress={() => setMode('create')}
              trailing={<Icon name="arrowRight" size={18} color={colors.onInk} strokeWidth={2.2} />}
            />
            <WhiteButton
              label="Join a project"
              onPress={() => setMode('join')}
              leading={<Icon name="team" size={18} color={colors.purple} strokeWidth={1.8} />}
            />
          </View>
        </FadeIn>

        {/* Study needs notes, not a project — StudyScreen never touched
            useProject(). The card here used to advertise it as "unlocks
            once your project exists", which wasn't true, and it wasn't
            pressable either. */}
        {hasNav ? (
          <FadeIn delay={180}>
            <Pressable
              onPress={() => onSelectTab('study')}
              accessibilityRole="button"
              style={({ pressed }) => [s.card, s.quizCard, pressed && s.pressedCard]}
            >
              <View style={[s.tile, { backgroundColor: colors.yellowSoft }]}>
                <Icon name="graduation" size={20} color={colors.yellowText} strokeWidth={1.8} />
              </View>
              <View style={s.flexText}>
                <Text style={s.t}>Make a practice quiz</Text>
                <Text style={s.m}>No project needed</Text>
              </View>
              <Icon name="next" size={16} color={colors.faint} strokeWidth={2} />
            </Pressable>
          </FadeIn>
        ) : null}
      </ScrollView>
      </GlassTarget>

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
    </GlassScene>
  );
}

/** The "Create project" path â€” same read-a-brief flow as replacing one from NewProjectScreen, minus the destructive-replace framing (there's nothing to replace yet), landing straight in the new project once built. */
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
            buildLabel="Create my project â†’"
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
              <Text style={[type.hero, styles.ink]}>Drop the brief.</Text>
              <Text style={[type.hero, styles.ink]}>
                I'll <Text style={styles.purple}>read it.</Text>
              </Text>
              <Text style={[type.body, styles.muted, styles.subtitle]}>
                Paste the brief or attach it as a PDF. I'll find the requirements and turn them into tasks â€” you'll
                see the plan before anything's created.
              </Text>
            </View>

            <TextInput
              value={briefText}
              onChangeText={setBriefText}
              placeholder="Paste the full assignment text hereâ€¦"
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
                  <Text style={[type.button, styles.onInk]}>Reading your briefâ€¦</Text>
                </>
              ) : (
                <Text style={[type.button, styles.onInk]}>Read my brief â†’</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoider>
  );
}


/** The "Join a project" path (GOnboarding2) — an invite code, previewed before submitting, then a security-definer RPC join (see migration 0016). */
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
  const [focused, setFocused] = useState(false);

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
          s.joinContent,
          { paddingTop: Math.max(insets.top, 40) + 6, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.joinTop}>
          <FadeIn>
            <GlassButton label="Back" onPress={() => !joining && onBack()}>
              <Icon name="back" size={20} color={colors.ink} strokeWidth={2} />
            </GlassButton>
          </FadeIn>

          <FadeIn delay={40}>
            <Text style={s.h1} accessibilityRole="header">
              Join a project
            </Text>
          </FadeIn>

          <FadeIn delay={80}>
            <View style={s.codeGroup}>
              <Text style={s.eyebrow}>Invite code</Text>
              <View style={[s.code, focused && s.codeFocus]}>
                <TextInput
                  value={code}
                  onChangeText={setCode}
                  placeholder="7F3KQ9LP"
                  placeholderTextColor={colors.faint}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoFocus={!initialCode}
                  editable={!joining}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  selectionColor={colors.purple}
                  accessibilityLabel="Invite code"
                  style={s.codeInput}
                />
              </View>
              {lookup.status === 'not_found' ? (
                <Text style={[s.m, s.coral]}>No project uses that code — check it and try again.</Text>
              ) : null}
            </View>
          </FadeIn>

          {lookup.status === 'found' ? (
            <FadeIn>
              <View style={[s.card, s.joinCard]}>
                <View style={[s.tile, { backgroundColor: colors.mint }]}>
                  <Icon name="joined" size={20} color={colors.mintText} strokeWidth={2.2} />
                </View>
                <View style={s.flexText}>
                  <Text style={s.m}>You'll join</Text>
                  <Text style={s.t} numberOfLines={1}>
                    {lookup.projectName}
                  </Text>
                </View>
              </View>
            </FadeIn>
          ) : null}

          {error ? (
            <FadeIn>
              <View style={s.errorBox}>
                <Icon name="exclamation" size={18} color={colors.redText} strokeWidth={2.2} />
                <Text style={s.errorText}>{error}</Text>
              </View>
            </FadeIn>
          ) : null}
        </View>

        <View style={s.spacer} />

        <FadeIn delay={120}>
          <View style={s.joinBottom}>
            <GradientButton
              label={joining ? 'Joining…' : 'Join project'}
              onPress={submit}
              disabled={code.trim().length === 0}
              loading={joining}
              style={s.stretch}
            />
            <Text style={s.m}>Ask a teammate for their code</Text>
          </View>
        </FadeIn>
      </ScrollView>
    </KeyboardAvoider>
  );
}

// The create-a-project flow (no board in this pass), unchanged.
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    gap: layout.sectionGap,
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
  pressed: {
    opacity: 0.6,
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

// GOnboarding (intro) and GOnboarding2 (join), copied from the boards.
const s = StyleSheet.create({
  pressed: {
    opacity: 0.6,
  },
  pressedCard: {
    transform: [{ scale: 0.985 }],
    opacity: 0.94,
  },
  stretch: {
    alignSelf: 'stretch',
  },
  spacer: {
    flex: 1,
    minHeight: 24,
  },
  eyebrow: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  t: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
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
  h1: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.06)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  // GOnboarding: padding 24 20 120, 28 between sections.
  introContent: {
    paddingHorizontal: 20,
    gap: 28,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: type.button.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.purple,
  },
  greeting: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  hi: {
    fontFamily: type.greeting.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: colors.ink,
  },
  hero: {
    alignItems: 'center',
    gap: 18,
  },
  mascotBox: {
    alignSelf: 'stretch',
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -130,
    marginTop: -100,
  },
  // Mascot source is 1.2:1.
  mascot: {
    width: 168,
    height: 140,
  },
  heroText: {
    alignItems: 'center',
    gap: 8,
  },
  heroTitle: {
    fontFamily: type.hero.fontFamily,
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -1.1,
    color: colors.ink,
    textAlign: 'center',
  },
  sub: {
    fontFamily: type.caption.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
  actions: {
    gap: 10,
  },
  quizCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  // GOnboarding2: padding 20 20 0, 24 between sections; button pinned 32 off the bottom.
  joinContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  joinTop: {
    gap: 24,
  },
  codeGroup: {
    gap: 10,
  },
  // Board .code: 72 high, 20 radius, Cabinet 30 with 6 tracking, ringed purple when focused.
  code: {
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.surface,
    boxShadow: '0 0 0 1px #ECEAF0',
  },
  codeFocus: {
    boxShadow: '0 0 0 1.5px #6C4CE8, 0 0 0 6px rgba(108,76,232,0.12)',
  },
  codeInput: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    textAlign: 'center',
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 30,
    letterSpacing: 6,
    color: colors.ink,
    outlineWidth: 0,
  },
  joinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
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
  joinBottom: {
    alignItems: 'center',
    gap: 10,
  },
});

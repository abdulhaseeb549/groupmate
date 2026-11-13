import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BriefReview, BriefReviewActions } from '../components/BriefReview';
import { FadeIn } from '../components/FadeIn';
import { GlassButton, GlassScene, GlassTarget } from '../components/Glass';
import { GradientButton } from '../components/GradientButton';
import { Icon, IconName } from '../components/Icon';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { BriefAttachment, commitExtractedProject, ExtractedProjectData, parseBrief } from '../state/briefParsing';
import { useNavigation } from '../state/NavigationProvider';
import { useProject } from '../state/ProjectRepository';
import { colors, type } from '../theme';
import { captureBriefPhoto } from '../utils/briefCamera';
import { useHardwareBackHandler } from '../utils/hardwareBack';
import { pickPdf } from '../utils/pdfPicker';

const MIN_LENGTH = 40;
type Phase = 'input' | 'loading' | 'review' | 'committing';

/** Boards GNewProject (input) and GBriefReview (what was found). */
export function NewProjectScreen() {
  const insets = useSafeAreaInsets();
  const { closeNewProject } = useNavigation();
  const { refetch } = useProject();

  const [phase, setPhase] = useState<Phase>('input');
  const [briefText, setBriefText] = useState('');
  const [briefFile, setBriefFile] = useState<BriefAttachment | null>(null);
  const [extracted, setExtracted] = useState<ExtractedProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const today = useMemo(() => new Date(), []);

  const canSubmit = briefText.trim().length >= MIN_LENGTH || briefFile !== null;
  const busy = phase === 'loading' || phase === 'committing';
  const reviewing = (phase === 'review' || phase === 'committing') && extracted !== null;

  useHardwareBackHandler(closeNewProject, !busy);

  async function attachPdf() {
    const { file, error: pickError } = await pickPdf();
    if (pickError) {
      setError(pickError);
      return;
    }
    if (!file) return;
    setError(null);
    setBriefFile(file);
  }

  async function attachPhoto() {
    const { file, error: captureError } = await captureBriefPhoto();
    if (captureError) {
      setError(captureError);
      return;
    }
    if (!file) return;
    setError(null);
    setBriefFile(file);
  }

  async function readBrief() {
    setPhase('loading');
    setError(null);
    const result = await parseBrief({
      briefText: briefText.trim() || undefined,
      briefFile: briefFile ?? undefined,
    });
    if (result.error) {
      setError(result.error);
      setPhase('input');
      return;
    }
    setExtracted(result.extracted);
    setPhase('review');
  }

  // No confirmation step: this adds a project alongside the ones you
  // already have, so there is nothing to lose by going ahead.
  async function commit() {
    if (!extracted) return;
    setPhase('committing');
    const result = await commitExtractedProject(extracted);
    if (result.error) {
      setError(result.error);
      setPhase('review');
      return;
    }
    refetch();
    closeNewProject();
  }

  function startOver() {
    setExtracted(null);
    setError(null);
    setBriefFile(null);
    setPhase('input');
  }

  const isPhoto = briefFile ? /^image\//.test(briefFile.mimeType ?? '') || /\.(jpe?g|png|heic|webp)$/i.test(briefFile.filename) : false;

  return (
    <GlassScene style={styles.screen}>
      <GlassTarget>
        <KeyboardAvoider style={styles.flex}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              reviewing && styles.contentReview,
              { paddingTop: Math.max(insets.top, 40) + 6, paddingBottom: (reviewing ? 140 : 120) + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <FadeIn>
              <GlassButton onPress={busy ? () => {} : closeNewProject} label="Cancel">
                <Icon name="chevronDown" size={20} color={colors.ink} strokeWidth={2} />
              </GlassButton>
            </FadeIn>

            {reviewing && extracted ? (
              <FadeIn delay={30}>
                <BriefReview
                  extracted={extracted}
                  today={today}
                  error={error}
                  committing={phase === 'committing'}
                  onStartOver={startOver}
                  onBuildPlan={commit}
                  hideActions
                />
              </FadeIn>
            ) : (
              <>
                <FadeIn delay={30}>
                  <View style={styles.intro}>
                    <Text style={styles.hero} accessibilityRole="header">
                      Drop the brief.{'\n'}I'll read it.
                    </Text>
                    <Text style={styles.sub}>You'll see the plan before anything changes.</Text>
                  </View>
                </FadeIn>

                <FadeIn delay={60}>
                  <TextInput
                    value={briefText}
                    onChangeText={setBriefText}
                    placeholder="Paste the assignment text…"
                    placeholderTextColor="#9D99A6"
                    multiline
                    textAlignVertical="top"
                    editable={phase !== 'loading'}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    accessibilityLabel="Assignment text"
                    style={[styles.card, styles.paste, focused && styles.pasteFocused]}
                  />
                </FadeIn>

                <FadeIn delay={90}>
                  <View style={styles.orBlock}>
                    <View style={styles.orRow}>
                      <View style={styles.hair} />
                      <Text style={styles.m}>or</Text>
                      <View style={styles.hair} />
                    </View>
                    {briefFile ? (
                      <View style={[styles.card, styles.fileCard]}>
                        <View style={styles.fileTile}>
                          <Icon name={isPhoto ? 'camera' : 'document'} size={20} color={colors.purple} strokeWidth={1.8} />
                        </View>
                        <View style={styles.flexText}>
                          <Text style={styles.t} numberOfLines={1}>
                            {briefFile.filename}
                          </Text>
                          <Text style={styles.m}>{isPhoto ? 'Photo' : 'PDF'}</Text>
                        </View>
                        <Pressable
                          onPress={() => setBriefFile(null)}
                          disabled={phase === 'loading'}
                          accessibilityRole="button"
                          accessibilityLabel="Remove file"
                          hitSlop={6}
                          style={({ pressed }) => [styles.removeFile, pressed && styles.pressed]}
                        >
                          <Icon name="close" size={14} color={colors.muted} strokeWidth={2.4} />
                        </Pressable>
                      </View>
                    ) : (
                      <View style={styles.choices}>
                        <Choice icon="document" label="PDF" onPress={attachPdf} disabled={phase === 'loading'} />
                        <Choice icon="camera" label="Photo" onPress={attachPhoto} disabled={phase === 'loading'} />
                      </View>
                    )}
                  </View>
                </FadeIn>

                {error ? (
                  <View style={styles.errorBox}>
                    <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
                    <Text style={[styles.m, styles.errorText]}>{error}</Text>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>

          {reviewing ? (
            <BriefReviewActions
              docked
              bottom={16 + insets.bottom}
              committing={phase === 'committing'}
              onStartOver={startOver}
              onBuildPlan={commit}
            />
          ) : (
            <View style={[styles.dock, { bottom: 28 + insets.bottom }]}>
              <GradientButton
                label={phase === 'loading' ? 'Reading your brief…' : 'Read my brief'}
                onPress={readBrief}
                loading={phase === 'loading'}
                disabled={!canSubmit || phase === 'loading'}
              />
            </View>
          )}
        </KeyboardAvoider>
      </GlassTarget>
    </GlassScene>
  );
}

function Choice({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === 'PDF' ? 'Attach a PDF' : 'Take a photo'}
      style={({ pressed }) => [styles.choice, pressed && styles.pressedLift]}
    >
      <Icon name={icon} size={19} color={colors.purple} strokeWidth={1.8} />
      <Text style={styles.choiceLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Shadowed views shrink when pressed instead of fading: a faded view shows
  // its Android shadow through it as a grey box.
  pressedLift: {
    transform: [{ scale: 0.97 }],
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  flexText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  content: {
    paddingHorizontal: 20,
    gap: 24,
  },
  contentReview: {
    gap: 22,
  },
  intro: {
    gap: 10,
  },
  hero: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 36,
    lineHeight: 39,
    letterSpacing: -1,
    color: colors.ink,
  },
  sub: {
    fontFamily: type.caption.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
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
  paste: {
    height: 196,
    padding: 16,
    color: colors.ink,
    fontFamily: type.body.fontFamily,
    fontSize: 16,
    lineHeight: 23,
  },
  pasteFocused: {
    borderWidth: 1.5,
    borderColor: colors.purple,
  },
  orBlock: {
    gap: 12,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hair: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#ECEAF0',
  },
  choices: {
    flexDirection: 'row',
    gap: 10,
  },
  choice: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(17,17,17,0.1)',
    shadowColor: '#1C1633',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  choiceLabel: {
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 15,
    lineHeight: 20,
    color: colors.ink,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 14,
  },
  fileTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F0ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeFile: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
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
  pressed: {
    opacity: 0.6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.redSoft,
    borderRadius: 16,
    padding: 14,
  },
  errorText: {
    flex: 1,
    color: colors.redText,
  },
  dock: {
    position: 'absolute',
    left: 20,
    right: 20,
  },
});

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AttachRow } from '../components/AttachRow';
import { BriefReview } from '../components/BriefReview';
import { Icon } from '../components/Icon';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { BriefAttachment, commitExtractedProject, ExtractedProjectData, parseBrief } from '../state/briefParsing';
import { useNavigation } from '../state/NavigationProvider';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, type } from '../theme';
import { captureBriefPhoto } from '../utils/briefCamera';
import { useHardwareBackHandler } from '../utils/hardwareBack';
import { pickPdf } from '../utils/pdfPicker';

const MIN_LENGTH = 40;
type Phase = 'input' | 'loading' | 'review' | 'committing';

export function NewProjectScreen() {
  const insets = useSafeAreaInsets();
  const { closeNewProject } = useNavigation();
  const { refetch } = useProject();

  const [phase, setPhase] = useState<Phase>('input');
  const [briefText, setBriefText] = useState('');
  const [briefFile, setBriefFile] = useState<BriefAttachment | null>(null);
  const [extracted, setExtracted] = useState<ExtractedProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);

  const canSubmit = briefText.trim().length >= MIN_LENGTH || briefFile !== null;
  const busy = phase === 'loading' || phase === 'committing';

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

  return (
    <KeyboardAvoider style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 32) + 14, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            onPress={closeNewProject}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            disabled={busy}
          >
            <Icon name="chevronDown" size={20} color={colors.ink} strokeWidth={2} />
          </Pressable>
        </View>

        {(phase === 'review' || phase === 'committing') && extracted ? (
          <BriefReview
            extracted={extracted}
            today={today}
            error={error}
            committing={phase === 'committing'}
            onStartOver={startOver}
            onBuildPlan={commit}
          />
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={[type.hero, styles.ink]}>Drop the brief.</Text>
              <Text style={[type.hero, styles.ink]}>
                I'll <Text style={styles.purple}>read it.</Text>
              </Text>
              <Text style={[type.body, styles.muted, styles.subtitle]}>
                Paste the brief, attach it as a PDF, or take a photo of it. I'll find the requirements and divide the
                work across your team — you'll see the plan before anything changes.
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
              {briefFile ? (
                <AttachRow
                  label=""
                  file={briefFile}
                  onAttach={() => {}}
                  onRemove={() => setBriefFile(null)}
                  disabled={phase === 'loading'}
                />
              ) : (
                <View style={styles.attachChoices}>
                  <Pressable
                    onPress={attachPdf}
                    disabled={phase === 'loading'}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.attachChoice, pressed && styles.pressed]}
                  >
                    <Icon name="document" size={16} color={colors.purple} strokeWidth={1.8} />
                    <Text style={[type.button, styles.purple]}>Attach a PDF</Text>
                  </Pressable>
                  <Pressable
                    onPress={attachPhoto}
                    disabled={phase === 'loading'}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.attachChoice, pressed && styles.pressed]}
                  >
                    <Icon name="camera" size={16} color={colors.purple} strokeWidth={1.8} />
                    <Text style={[type.button, styles.purple]}>Take a photo</Text>
                  </Pressable>
                </View>
              )}
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
                  <Text style={[type.button, styles.submitLabel]}>Reading your brief…</Text>
                </>
              ) : (
                <Text style={[type.button, styles.submitLabel]}>Read my brief →</Text>
              )}
            </Pressable>
          </>
        )}
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
    gap: layout.sectionGap,
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
  pressed: {
    opacity: 0.6,
  },
  intro: {
    gap: 8,
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
  attachChoices: {
    flexDirection: 'row',
    gap: 8,
  },
  attachChoice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
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
  submitLabel: {
    color: colors.onInk,
  },
});

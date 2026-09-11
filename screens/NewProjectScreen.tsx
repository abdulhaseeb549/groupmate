import { useMemo, useState } from 'react';
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
import { AttachRow } from '../components/AttachRow';
import { Card, CardDivider } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { TaskDivision } from '../components/TaskDivision';
import { TEAM, TEAM_ORDER } from '../data/team';
import { commitExtractedProject, ExtractedProjectData, parseBrief } from '../state/briefParsing';
import { useNavigation } from '../state/NavigationProvider';
import { useProject } from '../state/ProjectRepository';
import { colors, layout, type } from '../theme';
import { contentIcon } from '../utils/contentIcon';
import { formatDueDate } from '../utils/dates';
import { pickPdf, PdfFileInput } from '../utils/pdfPicker';

const MIN_LENGTH = 40;
type Phase = 'input' | 'loading' | 'review' | 'committing';

export function NewProjectScreen() {
  const insets = useSafeAreaInsets();
  const { closeNewProject } = useNavigation();
  const { project, refetch } = useProject();
  const [phase, setPhase] = useState<Phase>('input');
  const [briefText, setBriefText] = useState('');
  const [briefFile, setBriefFile] = useState<PdfFileInput | null>(null);
  const [syllabusFile, setSyllabusFile] = useState<PdfFileInput | null>(null);
  const [extracted, setExtracted] = useState<ExtractedProjectData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);

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
    if (kind === 'brief') {
      setBriefFile(file);
    } else {
      setSyllabusFile(file);
    }
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

  async function confirmCommit() {
    if (!extracted) return;
    setConfirming(false);
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
    setSyllabusFile(null);
    setPhase('input');
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          <ReviewView
            extracted={extracted}
            project={project}
            today={today}
            error={error}
            committing={phase === 'committing'}
            onStartOver={startOver}
            onBuildPlan={() => setConfirming(true)}
          />
        ) : (
          <>
            <View style={styles.intro}>
              <Text style={[type.pageTitle, styles.ink]}>Drop the brief.</Text>
              <Text style={[type.pageTitle, styles.ink]}>
                I'll <Text style={styles.purple}>read it.</Text>
              </Text>
              <Text style={[type.body, styles.muted, styles.subtitle]}>
                Paste the brief or attach it as a PDF. I'll find the requirements and divide the work across your
                team — you'll see the plan before anything changes.
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
                  <Text style={[type.button, styles.submitLabel]}>Reading your brief…</Text>
                </>
              ) : (
                <Text style={[type.button, styles.submitLabel]}>Read my brief →</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={confirming}
        title="Replace your current project?"
        message={`Your existing ${project.name} tasks and requirements will be replaced with this plan. This can't be undone.`}
        confirmLabel="Build my plan"
        destructive
        onConfirm={confirmCommit}
        onCancel={() => setConfirming(false)}
      />
    </KeyboardAvoidingView>
  );
}

function ReviewView({
  extracted,
  project,
  today,
  error,
  committing,
  onStartOver,
  onBuildPlan,
}: {
  extracted: ExtractedProjectData;
  project: { name: string };
  today: Date;
  error: string | null;
  committing: boolean;
  onStartOver: () => void;
  onBuildPlan: () => void;
}) {
  const assignees = TEAM_ORDER.map((id) => {
    const member = TEAM[id];
    return {
      initials: member.initials,
      name: member.name,
      bg: member.bg,
      fg: member.fg,
      tasks: extracted.tasks.filter((t) => t.assignee === id).map((t) => ({ title: t.title })),
    };
  });

  return (
    <View style={styles.review}>
      <View style={styles.intro}>
        <Text style={[type.caption, styles.muted]}>Here's what I found — nothing's changed yet</Text>
        <Text style={[type.pageTitle, styles.ink]} numberOfLines={2}>
          {extracted.projectName}
        </Text>
        <Text style={[type.body, styles.muted]}>
          {extracted.course} · Due {formatDueDate(extracted.dueDate, today)}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[type.button, styles.ink]}>
          {extracted.requirements.length} {extracted.requirements.length === 1 ? 'requirement' : 'requirements'}
        </Text>
        <Card>
          {extracted.requirements.map((r, i) => (
            <View key={r.label}>
              {i > 0 ? <CardDivider inset={16 + 16 + 10} /> : null}
              <View style={styles.requirementRow}>
                <View style={styles.requirementIcon}>
                  <Icon name={contentIcon(r.label)} size={16} color={colors.muted} strokeWidth={1.8} />
                </View>
                <Text style={[type.body, styles.ink, styles.requirementLabel]}>{r.label}</Text>
              </View>
            </View>
          ))}
        </Card>
      </View>

      <View style={styles.section}>
        <Text style={[type.button, styles.ink]}>How the work divides</Text>
        <Text style={[type.caption, styles.muted]}>{extracted.tasks.length} tasks across your team of 4</Text>
        <TaskDivision people={assignees} />
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
          <Text style={[type.caption, styles.errorText]}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.reviewActions}>
        <Pressable
          onPress={onStartOver}
          disabled={committing}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={[type.button, styles.ink]}>Start over</Text>
        </Pressable>
        <Pressable
          onPress={onBuildPlan}
          disabled={committing}
          accessibilityRole="button"
          style={({ pressed }) => [styles.submit, styles.buildButton, pressed && !committing && styles.submitPressed]}
        >
          {committing ? (
            <>
              <ActivityIndicator color={colors.onInk} />
              <Text style={[type.button, styles.submitLabel]}>Building your plan…</Text>
            </>
          ) : (
            <Text style={[type.button, styles.submitLabel]}>Build my plan →</Text>
          )}
        </Pressable>
      </View>
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
    gap: 18,
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
  review: {
    gap: 22,
  },
  section: {
    gap: 8,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  requirementIcon: {
    marginTop: 3,
  },
  requirementLabel: {
    flex: 1,
  },
  reviewActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buildButton: {
    flex: 2,
  },
});

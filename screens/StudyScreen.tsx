import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomNav, NavTab } from '../components/BottomNav';
import { GlassButton, GlassScene, GlassTarget } from '../components/Glass';
import { GradientButton, SecondaryButton } from '../components/GradientButton';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FadeIn } from '../components/FadeIn';
import { Icon } from '../components/Icon';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { Segmented } from '../components/Segmented';
import { useAuth } from '../state/AuthProvider';
import { useChatUnread } from '../state/chatUnread';
import { NotePager } from '../components/study/NotePager';
import { useNavigation } from '../state/NavigationProvider';
import {
  commitQuiz,
  deleteQuiz,
  Difficulty,
  ExtractedQuestion,
  ExtractedQuiz,
  fetchQuizQuestions,
  fetchQuizzes,
  generateNotes,
  generateQuiz,
  fetchQuizNotes,
  NotePage,
  QuizSummary,
  recordBestScore,
} from '../state/studyQuiz';
import { colors, gradients, radius, type } from '../theme';
import { useHardwareBackHandler } from '../utils/hardwareBack';
import { pickPdf, PdfFileInput } from '../utils/pdfPicker';

const MIN_LENGTH = 40;
// Quick picks, plus "Custom" for any number in range. The range matches the
// generate-quiz Edge Function, which also caps how many quizzes a day one
// student can make, so a big quiz can't quietly burn the AI budget.
const COUNTS = [15, 35, 45] as const;
const MIN_COUNT = 5;
const MAX_COUNT = 50;
const CUSTOM = -1;
const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MASCOT = require('../assets/Mascot-png.png');

type Phase = 'list' | 'notes' | 'setup' | 'quiz' | 'results';
type Insets = { top: number; bottom: number };

type Props = {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Mint at 80% and up, amber from half, coral below: the same rule everywhere a score shows. */
function scoreTone(score: number, total: number) {
  const share = total > 0 ? score / total : 0;
  if (share >= 0.8) return 'mint' as const;
  if (share >= 0.5) return 'amber' as const;
  return 'coral' as const;
}

const TONE = {
  mint: { bg: colors.mint, fg: colors.mintText, ring: colors.green, glow: '#E3F6EC' },
  amber: { bg: colors.yellowSoft, fg: colors.yellowText, ring: colors.amber, glow: '#FFF3D9' },
  coral: { bg: colors.redSoft, fg: colors.redText, ring: colors.red, glow: '#FFE9E7' },
};

export function StudyScreen({ activeTab, onSelectTab }: Props) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { hasUnread } = useChatUnread();
  const userId = session?.user.id;
  const { studySetupRequested, clearStudySetupRequest } = useNavigation();

  const [phase, setPhase] = useState<Phase>('list');
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuizSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [studyText, setStudyText] = useState('');
  const [syllabusFile, setSyllabusFile] = useState<PdfFileInput | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [questionCount, setQuestionCount] = useState<number>(15);
  const [generating, setGenerating] = useState(false);
  // The newest set of pointers, shown on the list. Held apart from
  // `quizzes`: the rows carry only a count, the pages are far more text.
  const [pointers, setPointers] = useState<{ quizId: string; title: string; pages: NotePage[] } | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [activeQuiz, setActiveQuiz] = useState<ExtractedQuiz | null>(null);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  async function refreshList() {
    if (!userId) return;
    try {
      const rows = await fetchQuizzes(userId);
      setQuizzes(rows);
      // Newest-first, so the first row with pointers is the most recent set.
      const newest = rows.find((row) => row.noteCount > 0);
      if (!newest) {
        setPointers(null);
        return;
      }
      const pages = await fetchQuizNotes(newest.id);
      setPointers(pages.length > 0 ? { quizId: newest.id, title: newest.title, pages } : null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load your quizzes.');
      setQuizzes((rows) => rows ?? []);
    }
  }

  useEffect(() => {
    void refreshList();
  }, [userId]);

  // The "+" menu's "Make a quiz" sets this from anywhere in the app.
  useEffect(() => {
    if (studySetupRequested) {
      openSetup();
      clearStudySetupRequest();
    }
  }, [studySetupRequested]);

  function openSetup() {
    setStudyText('');
    setSyllabusFile(null);
    setSetupError(null);
    setPhase('setup');
  }

  async function pickFile() {
    const { file, error } = await pickPdf();
    if (error) {
      setSetupError(error);
      return;
    }
    if (!file) return;
    setSetupError(null);
    setSyllabusFile(file);
  }

  async function handleGenerate() {
    setGenerating(true);
    setSetupError(null);

    // Both read the same upload, so they run together, and are settled
    // separately: the pointers failing must not cost the student the quiz.
    const source = {
      studyText: studyText.trim() || undefined,
      syllabusFile: syllabusFile ?? undefined,
    };
    const [result, notesResult] = await Promise.all([
      generateQuiz({ ...source, difficulty, questionCount }),
      generateNotes(source),
    ]);

    if (!result.quiz) {
      setSetupError(result.error);
      setGenerating(false);
      return;
    }
    const quiz = result.quiz;
    const { quizId, error } = await commitQuiz(quiz, difficulty, notesResult.pages);
    setGenerating(false);
    if (error) {
      setSetupError(error);
      return;
    }
    if (quizId && notesResult.pages) {
      setPointers({ quizId, title: quiz.title, pages: notesResult.pages });
    }
    startQuiz(quiz, quizId);
  }

  async function openExistingQuiz(summary: QuizSummary) {
    setListError(null);
    try {
      const questions = await fetchQuizQuestions(summary.id);
      startQuiz({ title: summary.title, questions }, summary.id);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load that quiz.');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await deleteQuiz(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    if (error) {
      setListError(error);
      return;
    }
    void refreshList();
  }

  function startQuiz(quiz: ExtractedQuiz, quizId: string | null) {
    setActiveQuiz(quiz);
    setActiveQuizId(quizId);
    setIndex(0);
    setSelected(null);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setPhase('quiz');
  }

  function answer(choiceIndex: number) {
    if (selected !== null || !activeQuiz) return;
    setSelected(choiceIndex);
    if (choiceIndex === activeQuiz.questions[index].correctIndex) {
      setScore((s) => s + 1);
      setStreak((s) => {
        const next = s + 1;
        setBestStreak((b) => Math.max(b, next));
        return next;
      });
    } else {
      setStreak(0);
    }
  }

  function next() {
    if (!activeQuiz) return;
    const isLast = index + 1 >= activeQuiz.questions.length;
    if (isLast) {
      if (activeQuizId) void recordBestScore(activeQuizId, score);
      setPhase('results');
      return;
    }
    setIndex((i) => i + 1);
    setSelected(null);
  }

  function backToList() {
    setPhase('list');
    void refreshList();
  }

  const canSubmit = studyText.trim().length >= MIN_LENGTH || syllabusFile !== null;

  useHardwareBackHandler(() => {
    if (phase === 'setup' || phase === 'notes') setPhase('list');
    else if (phase === 'quiz' || phase === 'results') backToList();
  }, phase !== 'list' && !generating);

  return (
    <GlassScene style={styles.screen}>
      <GlassTarget>
        {phase === 'list' ? (
          <ListView
            insets={insets}
            quizzes={quizzes}
            pointers={pointers}
            error={listError}
            onNewQuiz={openSetup}
            onOpenQuiz={openExistingQuiz}
            onDeleteQuiz={setDeleteTarget}
            onOpenNotes={() => setPhase('notes')}
          />
        ) : phase === 'notes' && pointers ? (
          <NotesView insets={insets} title={pointers.title} pages={pointers.pages} onBack={() => setPhase('list')} />
        ) : phase === 'setup' && generating ? (
          <WritingView count={questionCount} source={syllabusFile ? stripPdf(syllabusFile.filename) : 'Your notes'} />
        ) : phase === 'setup' ? (
          <SetupView
            insets={insets}
            studyText={studyText}
            onChangeText={setStudyText}
            syllabusFile={syllabusFile}
            onPickFile={pickFile}
            onRemoveFile={() => setSyllabusFile(null)}
            difficulty={difficulty}
            onChangeDifficulty={setDifficulty}
            questionCount={questionCount}
            onChangeQuestionCount={setQuestionCount}
            canSubmit={canSubmit}
            error={setupError}
            onBack={() => setPhase('list')}
            onGenerate={handleGenerate}
          />
        ) : phase === 'quiz' && activeQuiz ? (
          <QuizPlayerView
            insets={insets}
            quiz={activeQuiz}
            index={index}
            selected={selected}
            streak={streak}
            onAnswer={answer}
            onNext={next}
            onExit={backToList}
          />
        ) : phase === 'results' && activeQuiz ? (
          <ResultsView
            insets={insets}
            total={activeQuiz.questions.length}
            score={score}
            bestStreak={bestStreak}
            onStudyAgain={openSetup}
            onDone={backToList}
          />
        ) : null}
      </GlassTarget>

      {phase === 'list' ? <BottomNav active={activeTab} onSelect={onSelectTab} chatUnread={hasUnread} /> : null}

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete this quiz?"
        message={deleteTarget ? `"${deleteTarget.title}" and your best score will be gone for good.` : undefined}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </GlassScene>
  );
}

function stripPdf(name: string) {
  return name.replace(/\.pdf$/i, '');
}

/* ------------------------------------------------------------------ */
/* GNotes — every pointer card, one at a time, full screen             */
/* ------------------------------------------------------------------ */

function NotesView({
  insets,
  title,
  pages,
  onBack,
}: {
  insets: Insets;
  title: string;
  pages: NotePage[];
  onBack: () => void;
}) {
  const [noteIndex, setNoteIndex] = useState(0);
  return (
    <View style={[styles.flex, { paddingTop: Math.max(insets.top, 40) + 6, paddingBottom: 32 + insets.bottom }]}>
      <View style={styles.notesHeader}>
        <GlassButton onPress={onBack} label="Back">
          <Icon name="chevronLeft" size={20} color={colors.ink} strokeWidth={2.2} />
        </GlassButton>
        <View style={styles.flexText}>
          <Text style={styles.notesTitle} numberOfLines={1}>
            Points to remember
          </Text>
          <Text style={styles.m} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Text style={styles.counter} accessibilityLabel={`Card ${noteIndex + 1} of ${pages.length}`}>
          {noteIndex + 1}
          <Text style={styles.counterOf}> / {pages.length}</Text>
        </Text>
      </View>
      <View style={styles.notesBody}>
        <NotePager pages={pages} full onIndexChange={setNoteIndex} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* GStudy                                                              */
/* ------------------------------------------------------------------ */

function ListView({
  insets,
  quizzes,
  pointers,
  error,
  onNewQuiz,
  onOpenQuiz,
  onDeleteQuiz,
  onOpenNotes,
}: {
  insets: Insets;
  quizzes: QuizSummary[] | null;
  pointers: { quizId: string; title: string; pages: NotePage[] } | null;
  error: string | null;
  onNewQuiz: () => void;
  onOpenQuiz: (summary: QuizSummary) => void;
  onDeleteQuiz: (summary: QuizSummary) => void;
  onOpenNotes: () => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={[styles.listContent, { paddingTop: Math.max(insets.top, 40) + 14, paddingBottom: 140 + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <FadeIn>
        <Text style={styles.h1} accessibilityRole="header">
          Study
        </Text>
      </FadeIn>

      {/* One tap to start: the whole card is the button. */}
      <FadeIn delay={40}>
        <Pressable
          onPress={onNewQuiz}
          accessibilityRole="button"
          accessibilityLabel="Practice questions, make a quiz"
          style={({ pressed }) => [styles.card, styles.practice, pressed && styles.pressedCard]}
        >
          <View style={styles.practiceTile}>
            <Icon name="book" size={22} color={colors.purple} strokeWidth={1.8} />
          </View>
          <View style={styles.flexText}>
            <Text style={styles.t}>Practice questions</Text>
            <Text style={styles.m}>From a PDF or your notes</Text>
          </View>
          <View style={styles.plusShadow}>
            <LinearGradient colors={gradients.purpleDeep} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.plus}>
              <Icon name="plus" size={20} color="#FFFFFF" strokeWidth={2.3} />
            </LinearGradient>
          </View>
        </Pressable>
      </FadeIn>

      {/* Points to remember: one flashcard at a time. */}
      <FadeIn delay={80}>
        <View style={styles.section}>
          <View style={styles.leadRow}>
            <View style={[styles.leadBlock, styles.flexText]}>
              <Text style={styles.lead}>Points to remember</Text>
              {pointers ? (
                <Text style={styles.m} numberOfLines={1}>
                  {pointers.title}
                </Text>
              ) : null}
            </View>
            {pointers ? (
              <Pressable
                onPress={onOpenNotes}
                accessibilityRole="button"
                accessibilityLabel="See all points to remember"
                style={({ pressed }) => [styles.seeAll, pressed && styles.pressedSmall]}
              >
                <Text style={styles.linkText}>See all</Text>
                <Icon name="chevronRight" size={14} color={colors.purple} strokeWidth={2.4} />
              </Pressable>
            ) : null}
          </View>
          {pointers ? (
            <NotePager key={pointers.quizId} pages={pointers.pages} compact onOpen={onOpenNotes} />
          ) : (
            <View style={[styles.card, styles.emptyCard]}>
              <Text style={styles.t}>Nothing to revise yet</Text>
              <Text style={styles.m}>Make a quiz and these come with it</Text>
            </View>
          )}
        </View>
      </FadeIn>

      {error ? <ErrorBox text={error} /> : null}

      {/* Quizzes: one card, best score leads each row. */}
      <FadeIn delay={120}>
        <View style={styles.section}>
          <Text style={styles.lead}>Your quizzes</Text>
          {quizzes === null ? (
            <ActivityIndicator color={colors.purple} style={styles.listLoading} />
          ) : quizzes.length === 0 ? (
            <View style={[styles.card, styles.emptyCard]}>
              <Text style={styles.t}>No quizzes yet</Text>
              <Text style={styles.m}>Your quizzes show up here</Text>
            </View>
          ) : (
            <View style={styles.card}>
              {quizzes.map((q, i) => (
                <View key={q.id}>
                  {i > 0 ? <View style={styles.hair} /> : null}
                  <View style={styles.qrow}>
                    <Pressable
                      onPress={() => onOpenQuiz(q)}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${q.title}`}
                      style={({ pressed }) => [styles.qrowMain, pressed && styles.pressedRow]}
                    >
                      <View style={styles.flexText}>
                        <Text style={styles.t} numberOfLines={1}>
                          {q.title}
                        </Text>
                        <Text style={styles.m} numberOfLines={1}>
                          {capitalize(q.difficulty)} · {q.questionCount} questions
                        </Text>
                      </View>
                      <ScorePill best={q.bestScore} total={q.questionCount} />
                    </Pressable>
                    <Pressable
                      onPress={() => onDeleteQuiz(q)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${q.title}`}
                      style={({ pressed }) => [styles.del, pressed && styles.delPressed]}
                    >
                      <Icon name="trash" size={17} color={colors.faint} strokeWidth={1.8} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </FadeIn>
    </ScrollView>
  );
}

function ScorePill({ best, total }: { best: number | null | undefined; total: number }) {
  if (best == null) {
    return (
      <View style={[styles.pill, styles.pillGrey]}>
        <Text style={[styles.pillText, { color: colors.muted }]}>New</Text>
      </View>
    );
  }
  const tone = TONE[scoreTone(best, total)];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]} accessibilityLabel={`Best ${best} of ${total}`}>
      <Text style={[styles.pillText, { color: tone.fg }]}>
        {best}/{total}
      </Text>
    </View>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <Icon name="exclamation" size={18} color={colors.redText} strokeWidth={2.2} />
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* GQuiz                                                               */
/* ------------------------------------------------------------------ */

function Bars({ level, selected }: { level: number; selected: boolean }) {
  const color = selected ? colors.purple : colors.muted;
  return (
    <View style={styles.bars}>
      {[5, 8, 12].map((h, i) => (
        <View key={h} style={[styles.bar, { height: h, backgroundColor: color, opacity: i < level ? 1 : 0.25 }]} />
      ))}
    </View>
  );
}

function SetupView({
  insets,
  studyText,
  onChangeText,
  syllabusFile,
  onPickFile,
  onRemoveFile,
  difficulty,
  onChangeDifficulty,
  questionCount,
  onChangeQuestionCount,
  canSubmit,
  error,
  onBack,
  onGenerate,
}: {
  insets: Insets;
  studyText: string;
  onChangeText: (v: string) => void;
  syllabusFile: PdfFileInput | null;
  onPickFile: () => void;
  onRemoveFile: () => void;
  difficulty: Difficulty;
  onChangeDifficulty: (d: Difficulty) => void;
  questionCount: number;
  onChangeQuestionCount: (n: number) => void;
  canSubmit: boolean;
  error: string | null;
  onBack: () => void;
  onGenerate: () => void;
}) {
  // PDF first, as on the board; "Paste notes instead" swaps the card for a text box.
  const [mode, setMode] = useState<'pdf' | 'notes'>(studyText ? 'notes' : 'pdf');
  const [custom, setCustom] = useState(!(COUNTS as readonly number[]).includes(questionCount));
  const [customText, setCustomText] = useState(String(questionCount));
  const customNumber = Number(customText);
  const customValid = !custom || (customNumber >= MIN_COUNT && customNumber <= MAX_COUNT);
  const sizeMb = syllabusFile ? (syllabusFile.base64.length * 0.75) / (1024 * 1024) : 0;

  return (
    <KeyboardAvoider style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.setupContent, { paddingTop: Math.max(insets.top, 40) + 6, paddingBottom: 150 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn>
          <GlassButton onPress={onBack} label="Close">
            <Icon name="close" size={20} color={colors.ink} strokeWidth={2} />
          </GlassButton>
        </FadeIn>

        <FadeIn delay={30}>
          <Text style={styles.h1} accessibilityRole="header">
            Make a quiz
          </Text>
        </FadeIn>

        <FadeIn delay={60}>
          <View style={styles.group}>
            <Text style={styles.eyebrow}>From</Text>
            {mode === 'pdf' ? (
              syllabusFile ? (
                <View style={[styles.card, styles.fileCard]}>
                  <PdfTile />
                  <View style={styles.flexText}>
                    <Text style={styles.t} numberOfLines={1}>
                      {stripPdf(syllabusFile.filename)}
                    </Text>
                    <Text style={styles.m}>{sizeMb >= 0.1 ? `${sizeMb.toFixed(1)} MB` : 'PDF'}</Text>
                  </View>
                  <Pressable
                    onPress={onRemoveFile}
                    accessibilityRole="button"
                    accessibilityLabel="Remove file"
                    hitSlop={6}
                    style={({ pressed }) => [styles.removeFile, pressed && styles.pressedSmall]}
                  >
                    <Icon name="close" size={14} color={colors.muted} strokeWidth={2.4} />
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={onPickFile}
                  accessibilityRole="button"
                  accessibilityLabel="Choose a PDF"
                  style={({ pressed }) => [styles.card, styles.fileCard, pressed && styles.pressedCard]}
                >
                  <PdfTile />
                  <View style={styles.flexText}>
                    <Text style={styles.t}>Choose a PDF</Text>
                    <Text style={styles.m}>Up to 15 MB</Text>
                  </View>
                  <Icon name="chevronRight" size={18} color={colors.faint} strokeWidth={2} />
                </Pressable>
              )
            ) : (
              <TextInput
                value={studyText}
                onChangeText={onChangeText}
                placeholder="Paste your notes"
                placeholderTextColor={colors.faint}
                multiline
                textAlignVertical="top"
                style={styles.notes}
                autoFocus
              />
            )}
            <Pressable
              onPress={() => {
                if (mode === 'pdf') {
                  onRemoveFile();
                  setMode('notes');
                } else {
                  onChangeText('');
                  setMode('pdf');
                }
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.link, pressed && styles.pressedSmall]}
            >
              <Icon name={mode === 'pdf' ? 'clipboard' : 'document'} size={17} color={colors.purple} strokeWidth={1.9} />
              <Text style={styles.linkText}>{mode === 'pdf' ? 'Paste notes instead' : 'Attach a PDF instead'}</Text>
            </Pressable>
          </View>
        </FadeIn>

        <FadeIn delay={90}>
          <View style={styles.group}>
            <Text style={styles.eyebrow}>Level</Text>
            <Segmented<Difficulty>
              label="Level"
              value={difficulty}
              onChange={onChangeDifficulty}
              options={[
                { value: 'easy', label: 'Easy', leading: (s) => <Bars level={1} selected={s} /> },
                { value: 'medium', label: 'Medium', leading: (s) => <Bars level={2} selected={s} /> },
                { value: 'hard', label: 'Hard', leading: (s) => <Bars level={3} selected={s} /> },
              ]}
            />
          </View>
        </FadeIn>

        <FadeIn delay={120}>
          <View style={styles.group}>
            <Text style={styles.eyebrow}>Questions</Text>
            <Segmented<number>
              label="Number of questions"
              value={custom ? CUSTOM : questionCount}
              onChange={(v) => {
                if (v === CUSTOM) {
                  setCustom(true);
                  setCustomText(String(questionCount));
                } else {
                  setCustom(false);
                  onChangeQuestionCount(v);
                }
              }}
              options={[...COUNTS.map((c) => ({ value: c as number, label: String(c) })), { value: CUSTOM, label: 'Custom' }]}
            />
            {custom ? (
              <FadeIn>
                <View style={[styles.customField, !customValid && styles.customFieldBad]}>
                  <TextInput
                    value={customText}
                    onChangeText={(v) => {
                      const digits = v.replace(/[^0-9]/g, '').slice(0, 2);
                      setCustomText(digits);
                      const n = Number(digits);
                      if (n >= MIN_COUNT && n <= MAX_COUNT) onChangeQuestionCount(n);
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    autoFocus
                    accessibilityLabel="Number of questions"
                    style={styles.customInput}
                  />
                  <Text style={styles.m}>
                    questions · {MIN_COUNT}–{MAX_COUNT}
                  </Text>
                </View>
              </FadeIn>
            ) : null}
          </View>
        </FadeIn>

        {error ? <ErrorBox text={error} /> : null}
      </ScrollView>

      {/* Action in the thumb zone. */}
      <View style={[styles.bottomAction, { paddingBottom: Math.max(insets.bottom, 0) + 28 }]}>
        <GradientButton
          label={`Make ${questionCount} questions`}
          onPress={onGenerate}
          disabled={!canSubmit || !customValid}
          style={styles.fullWidth}
        />
        <Text style={styles.caption}>Points to remember come with it</Text>
      </View>
    </KeyboardAvoider>
  );
}

function PdfTile() {
  return (
    <LinearGradient colors={['#FFF0EF', '#FFE3E1']} style={styles.pdfTile}>
      <Icon name="document" size={20} color={colors.redText} strokeWidth={1.8} />
      <Text style={styles.pdfLabel}>PDF</Text>
    </LinearGradient>
  );
}

/* ------------------------------------------------------------------ */
/* GQuizWriting                                                        */
/* ------------------------------------------------------------------ */

function WritingView({ count, source }: { count: number; source: string }) {
  const bob = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    const slideLoop = Animated.loop(
      Animated.timing(slide, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    );
    bobLoop.start();
    slideLoop.start();
    return () => {
      bobLoop.stop();
      slideLoop.stop();
    };
  }, [bob, slide]);

  return (
    <View style={styles.writing}>
      <FadeIn>
        <View style={styles.mascotWrap}>
          <Svg width={240} height={220} style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient id="mascotGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#ECE6FF" stopOpacity={1} />
                <Stop offset="1" stopColor="#FAF9F7" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={240} height={220} fill="url(#mascotGlow)" />
          </Svg>
          <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] }}>
            <Image source={MASCOT} style={styles.mascot} resizeMode="contain" accessibilityIgnoresInvertColors />
          </Animated.View>
        </View>
      </FadeIn>
      <FadeIn delay={60}>
        <View style={styles.writingText}>
          <Text style={styles.writingTitle} accessibilityRole="header">
            Writing {count} questions
          </Text>
          <Text style={styles.writingSource} numberOfLines={1}>
            {source}
          </Text>
        </View>
      </FadeIn>
      <View style={styles.indeterminate} accessible accessibilityRole="progressbar" accessibilityLabel="Writing your quiz">
        <Animated.View
          style={[
            styles.indeterminateFill,
            { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-64, 160] }) }] },
          ]}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* GQuizQuestion + GQuizChecked                                        */
/* ------------------------------------------------------------------ */

function QuizPlayerView({
  insets,
  quiz,
  index,
  selected,
  streak,
  onAnswer,
  onNext,
  onExit,
}: {
  insets: Insets;
  quiz: ExtractedQuiz;
  index: number;
  selected: number | null;
  streak: number;
  onAnswer: (choiceIndex: number) => void;
  onNext: () => void;
  onExit: () => void;
}) {
  const question: ExtractedQuestion = quiz.questions[index];
  const total = quiz.questions.length;
  const answered = selected !== null;
  const isCorrect = answered && selected === question.correctIndex;
  const isLast = index + 1 >= total;

  // Progress counts finished questions: 2 done while on 3 of 10 is 20%.
  const progress = useRef(new Animated.Value(index / total)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: (index + (answered ? 1 : 0)) / total,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [index, answered, total, progress]);

  // The question block slides in fresh for every question.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index, enter]);
  const enterStyle = {
    opacity: enter,
    transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  };

  return (
    <View style={styles.flex}>
      <View style={[styles.quizHeader, { paddingTop: Math.max(insets.top, 40) + 6 }]}>
        <GlassButton onPress={onExit} label="Exit quiz">
          <Icon name="close" size={18} color={colors.ink} strokeWidth={2} />
        </GlassButton>
        <View
          style={styles.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Question ${index + 1} of ${total}`}
        >
          <Animated.View
            style={[styles.fill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]}
          />
        </View>
        <StreakPill streak={streak} />
      </View>

      <ScrollView contentContainerStyle={styles.questionBody} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.questionBlock, enterStyle]}>
          <Text style={styles.eyebrow}>
            {index + 1} of {total}
          </Text>
          <Text style={styles.prompt} accessibilityRole="header">
            {question.prompt}
          </Text>
          {answered ? <Explanation correct={isCorrect} text={question.explanation} /> : null}
        </Animated.View>
      </ScrollView>

      {/* Choices sit in the thumb zone; one tap answers. */}
      <Animated.View
        style={[styles.choiceZone, { paddingBottom: Math.max(insets.bottom, 0) + (answered ? 28 : 32) }, enterStyle]}
        accessibilityRole="radiogroup"
        accessibilityLabel="Answers"
      >
        {question.choices.map((choice, i) => {
          const isRight = i === question.correctIndex;
          const state: OptionState = !answered
            ? 'idle'
            : isRight
              ? 'right'
              : selected === i
                ? 'wrong'
                : 'dim';
          return (
            <OptionRow
              key={`${index}-${i}`}
              letter={KEYS[i] ?? String(i + 1)}
              label={choice}
              state={state}
              disabled={answered}
              onPress={() => onAnswer(i)}
            />
          );
        })}
        {answered ? (
          <FadeIn>
            <GradientButton label={isLast ? 'See results' : 'Next question'} onPress={onNext} style={styles.nextButton} />
          </FadeIn>
        ) : null}
      </Animated.View>
    </View>
  );
}

function StreakPill({ streak }: { streak: number }) {
  const lit = streak > 0;
  const pop = useRef(new Animated.Value(1)).current;
  const last = useRef(streak);
  useEffect(() => {
    if (streak > last.current) {
      pop.setValue(1.18);
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 12 }).start();
    }
    last.current = streak;
  }, [streak, pop]);

  return (
    <Animated.View
      accessibilityLabel={`Streak ${streak}`}
      style={[styles.streak, lit ? styles.streakLit : styles.streakOff, { transform: [{ scale: pop }] }]}
    >
      <Icon
        name="flame"
        size={14}
        color={lit ? colors.amber : colors.faint}
        fill={lit ? colors.amber : 'none'}
        strokeWidth={lit ? 1.6 : 1.8}
      />
      <Text style={[styles.streakText, { color: lit ? colors.yellowText : colors.faint }]}>{streak}</Text>
    </Animated.View>
  );
}

function Explanation({ correct, text }: { correct: boolean; text: string }) {
  return (
    <FadeIn>
      <View role="status" style={[styles.explain, { backgroundColor: correct ? colors.mint : colors.redSoft }]}>
        <View style={styles.explainIcon}>
          <Icon
            name={correct ? 'tick' : 'cross'}
            size={18}
            color={correct ? colors.mintText : colors.redText}
            strokeWidth={2.2}
          />
        </View>
        <Text style={[styles.explainText, { color: correct ? colors.mintText : colors.redText }]}>{text}</Text>
      </View>
    </FadeIn>
  );
}

type OptionState = 'idle' | 'right' | 'wrong' | 'dim';

function OptionRow({
  letter,
  label,
  state,
  disabled,
  onPress,
}: {
  letter: string;
  label: string;
  state: OptionState;
  disabled: boolean;
  onPress: () => void;
}) {
  // A quick press-in, and a small pop or shake when the answer lands.
  const scale = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const dim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state === 'right') {
      scale.setValue(0.97);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 10 }).start();
    } else if (state === 'wrong') {
      Animated.sequence(
        [6, -6, 4, -4, 0].map((x) =>
          Animated.timing(shake, { toValue: x, duration: 55, easing: Easing.linear, useNativeDriver: true })
        )
      ).start();
    }
    Animated.timing(dim, { toValue: state === 'dim' ? 0.45 : 1, duration: 220, useNativeDriver: true }).start();
  }, [state, scale, shake, dim]);

  const tone =
    state === 'right'
      ? { bg: colors.mint, border: colors.green, fg: colors.mintText, keyBg: colors.green, keyFg: '#FFFFFF' }
      : state === 'wrong'
        ? { bg: colors.redSoft, border: colors.red, fg: colors.redText, keyBg: colors.red, keyFg: '#FFFFFF' }
        : { bg: colors.surface, border: colors.border, fg: colors.ink, keyBg: 'rgba(21,21,26,0.05)', keyFg: colors.muted };

  return (
    <Animated.View style={{ opacity: dim, transform: [{ scale }, { translateX: shake }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() => Animated.timing(scale, { toValue: 0.98, duration: 90, useNativeDriver: true }).start()}
        onPressOut={() => {
          if (state === 'idle') Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20 }).start();
        }}
        disabled={disabled}
        accessibilityRole="radio"
        accessibilityState={{ checked: state === 'right' || state === 'wrong', disabled }}
        accessibilityLabel={
          state === 'right' ? `${label}, correct answer` : state === 'wrong' ? `${label}, your answer, wrong` : label
        }
        style={[
          styles.opt,
          { backgroundColor: tone.bg, borderColor: tone.border, borderWidth: state === 'right' || state === 'wrong' ? 1.5 : 1 },
        ]}
      >
        <View style={[styles.key, { backgroundColor: tone.keyBg }]}>
          <Text style={[styles.keyText, { color: tone.keyFg }]}>{letter}</Text>
        </View>
        <Text style={[styles.optText, { color: tone.fg }]}>{label}</Text>
        {state === 'right' ? <Icon name="tick" size={18} color={colors.mintText} strokeWidth={2.4} /> : null}
        {state === 'wrong' ? <Icon name="cross" size={18} color={colors.redText} strokeWidth={2.4} /> : null}
      </Pressable>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* GQuizResult                                                         */
/* ------------------------------------------------------------------ */

const RING = 232;
const STROKE = 12;
const R = (RING - STROKE) / 2 - 4; // 106, as on the board
const CIRC = 2 * Math.PI * R;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function ResultsView({
  insets,
  total,
  score,
  bestStreak,
  onStudyAgain,
  onDone,
}: {
  insets: Insets;
  total: number;
  score: number;
  bestStreak: number;
  onStudyAgain: () => void;
  onDone: () => void;
}) {
  const share = total > 0 ? score / total : 0;
  const toneKey = scoreTone(score, total);
  const tone = TONE[toneKey];
  const message = toneKey === 'mint' ? 'Nailed it' : toneKey === 'amber' ? 'Good effort' : 'Worth another pass';

  // The ring fills to the score; the number counts up with it.
  const fill = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = fill.addListener(({ value }) => setShown(Math.round(value * score)));
    Animated.sequence([
      Animated.delay(150),
      Animated.timing(fill, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 8 }).start();
    return () => fill.removeListener(id);
  }, [fill, pop, score]);

  return (
    <View style={[styles.flex, { paddingTop: Math.max(insets.top, 40) }]}>
      <Svg width={420} height={420} style={styles.resultGlow} pointerEvents="none">
        <Defs>
          <RadialGradient id="resultGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tone.glow} stopOpacity={1} />
            <Stop offset="1" stopColor="#FAF9F7" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={420} height={420} fill="url(#resultGlow)" />
      </Svg>

      <View style={styles.resultCenter}>
        <Animated.View
          style={[styles.ring, { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${score} out of ${total} correct`}
        >
          <Svg width={RING} height={RING} style={{ transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke="#F1ECE2" strokeWidth={STROKE} />
            <AnimatedCircle
              cx={RING / 2}
              cy={RING / 2}
              r={R}
              fill="none"
              stroke={tone.ring}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${CIRC} ${CIRC}`}
              strokeDashoffset={fill.interpolate({ inputRange: [0, 1], outputRange: [CIRC, CIRC * (1 - share)] })}
            />
          </Svg>
          <View style={styles.ringInner}>
            <Icon name="flame" size={26} color={colors.amber} fill={colors.amber} strokeWidth={1.4} />
            <View style={styles.scoreRow}>
              <Text style={styles.scoreBig}>{shown}</Text>
              <Text style={styles.scoreOf}>/{total}</Text>
            </View>
          </View>
        </Animated.View>

        <FadeIn delay={500}>
          <View style={styles.resultText}>
            <Text style={styles.resultMessage}>{message}</Text>
            {bestStreak > 1 ? (
              <View style={styles.bestStreak}>
                <Text style={styles.bestStreakText}>Best streak · {bestStreak} in a row</Text>
              </View>
            ) : null}
          </View>
        </FadeIn>
      </View>

      <View style={[styles.resultActions, { paddingBottom: Math.max(insets.bottom, 0) + 28 }]}>
        <SecondaryButton label="Study again" onPress={onStudyAgain} style={styles.flex} />
        <GradientButton label="Done" onPress={onDone} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  flex: {
    flex: 1,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  // Board type
  h1: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.9,
    color: colors.ink,
  },
  lead: {
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
    color: colors.ink,
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
  eyebrow: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  caption: {
    fontFamily: type.caption.fontFamily,
    fontSize: 13,
    lineHeight: 18,
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
  pressedCard: {
    transform: [{ scale: 0.985 }],
    opacity: 0.94,
  },
  pressedRow: {
    opacity: 0.6,
  },
  pressedSmall: {
    opacity: 0.6,
  },
  flexText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  hair: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  section: {
    gap: 12,
  },
  leadRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 44,
    marginBottom: -10,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  notesTitle: {
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  counter: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  counterOf: {
    color: colors.faint,
  },
  notesBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 28,
  },
  leadBlock: {
    gap: 2,
  },
  // GStudy
  listContent: {
    paddingHorizontal: 20,
    gap: 24,
  },
  practice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  practiceTile: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusShadow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6C4CE8',
    shadowColor: '#5836D6',
    shadowOpacity: 0.28,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  plus: {
    flex: 1,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    padding: 16,
    gap: 2,
  },
  listLoading: {
    paddingVertical: 24,
  },
  qrow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  qrowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingVertical: 12,
    paddingLeft: 16,
  },
  pill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillGrey: {
    backgroundColor: 'rgba(21,21,26,0.05)',
  },
  pillText: {
    fontFamily: type.badge.fontFamily,
    fontSize: 12,
    lineHeight: 16,
  },
  del: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginLeft: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  delPressed: {
    backgroundColor: colors.redSoft,
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
  // GQuiz
  setupContent: {
    paddingHorizontal: 20,
    gap: 24,
  },
  group: {
    gap: 10,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 14,
  },
  pdfTile: {
    width: 48,
    height: 56,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(196,64,59,0.15)',
  },
  pdfLabel: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0.4,
    color: colors.redText,
  },
  removeFile: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notes: {
    minHeight: 160,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    color: colors.ink,
    fontFamily: type.body.fontFamily,
    fontSize: 16,
    lineHeight: 22,
  },
  customField: {
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  customFieldBad: {
    borderColor: colors.red,
  },
  customInput: {
    width: 44,
    fontFamily: type.sectionHeading.fontFamily,
    fontSize: 18,
    lineHeight: 24,
    color: colors.ink,
    padding: 0,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    alignSelf: 'flex-start',
  },
  linkText: {
    fontFamily: type.button.fontFamily,
    fontSize: 14,
    lineHeight: 20,
    color: colors.purple,
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 12,
  },
  bar: {
    width: 3,
    borderRadius: 1,
  },
  bottomAction: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 0,
    alignItems: 'center',
    gap: 10,
  },
  // GQuizWriting
  writing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 28,
    paddingHorizontal: 32,
  },
  mascotWrap: {
    width: 240,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascot: {
    width: 200,
    height: 167,
  },
  writingText: {
    alignItems: 'center',
    gap: 8,
  },
  writingTitle: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 28,
    lineHeight: 31,
    letterSpacing: -0.7,
    color: colors.ink,
    textAlign: 'center',
  },
  writingSource: {
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 15,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
  indeterminate: {
    width: 160,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  indeterminateFill: {
    width: 64,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.purple,
  },
  // GQuizQuestion / GQuizChecked
  quizHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.purple,
  },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  streakLit: {
    backgroundColor: colors.yellowSoft,
  },
  streakOff: {
    backgroundColor: 'rgba(21,21,26,0.05)',
  },
  streakText: {
    fontFamily: type.badge.fontFamily,
    fontSize: 14,
    lineHeight: 18,
  },
  questionBody: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 16,
  },
  questionBlock: {
    gap: 12,
  },
  prompt: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.7,
    color: colors.ink,
  },
  explain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  explainIcon: {
    marginTop: 1,
  },
  explainText: {
    flex: 1,
    fontFamily: type.caption.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  },
  choiceZone: {
    paddingHorizontal: 20,
    gap: 10,
  },
  opt: {
    minHeight: 60,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 16,
    shadowColor: '#1C1633',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  key: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontFamily: type.button.fontFamily,
    fontSize: 14,
    lineHeight: 18,
  },
  optText: {
    flex: 1,
    fontFamily: type.taskTitle.fontFamily,
    fontSize: 16,
    lineHeight: 22,
  },
  nextButton: {
    marginTop: 8,
  },
  // GQuizResult
  resultGlow: {
    position: 'absolute',
    alignSelf: 'center',
    top: 150,
  },
  resultCenter: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 120,
    gap: 28,
  },
  ring: {
    width: RING,
    height: RING,
  },
  ringInner: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  scoreBig: {
    fontFamily: type.hero.fontFamily,
    fontSize: 88,
    lineHeight: 92,
    letterSpacing: -3,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  scoreOf: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 32,
    lineHeight: 34,
    letterSpacing: -0.5,
    color: colors.faint,
  },
  resultText: {
    alignItems: 'center',
    gap: 12,
  },
  resultMessage: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.7,
    color: colors.ink,
  },
  bestStreak: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    backgroundColor: colors.yellowSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bestStreakText: {
    fontFamily: type.badge.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: colors.yellowText,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
  },
});

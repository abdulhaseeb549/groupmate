import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
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
import { Card, CardDivider } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { KeyboardAvoider } from '../components/KeyboardAvoider';
import { useAuth } from '../state/AuthProvider';
import { useChatUnread } from '../state/chatUnread';
import { useNavigation } from '../state/NavigationProvider';
import {
  commitQuiz,
  deleteQuiz,
  Difficulty,
  ExtractedQuestion,
  ExtractedQuiz,
  fetchQuizQuestions,
  fetchQuizzes,
  generateQuiz,
  QuizSummary,
  recordBestScore,
} from '../state/studyQuiz';
import { colors, layout, type } from '../theme';
import { pickPdf, PdfFileInput } from '../utils/pdfPicker';

const MIN_LENGTH = 40;
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const COUNTS = [5, 10, 15] as const;
const QUIZ_DIVIDER_INSET = 16 + layout.iconTile + 12;

type Phase = 'list' | 'setup' | 'quiz' | 'results';

type Props = {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
};

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [generating, setGenerating] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [activeQuiz, setActiveQuiz] = useState<ExtractedQuiz | null>(null);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

  // Imperative rather than a phase-dependent effect: refreshList() is called
  // explicitly wherever the list needs to reflect a change (mount, and
  // returning from a finished quiz) rather than relying on a re-render to
  // happen to fire it.
  async function refreshList() {
    if (!userId) return;
    try {
      const rows = await fetchQuizzes(userId);
      setQuizzes(rows);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Could not load your quizzes.');
    }
  }

  useEffect(() => {
    void refreshList();
  }, [userId]);

  // The "+" menu's Study shortcut sets this from anywhere in the app —
  // jump straight into the new-quiz setup instead of landing on the list.
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
    const result = await generateQuiz({
      studyText: studyText.trim() || undefined,
      syllabusFile: syllabusFile ?? undefined,
      difficulty,
      questionCount,
    });
    if (!result.quiz) {
      setSetupError(result.error);
      setGenerating(false);
      return;
    }
    const quiz = result.quiz;
    const { quizId, error } = await commitQuiz(quiz, difficulty);
    setGenerating(false);
    if (error) {
      setSetupError(error);
      return;
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.spring);
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIndex((i) => i + 1);
    setSelected(null);
  }

  const canSubmit = studyText.trim().length >= MIN_LENGTH || syllabusFile !== null;
  const busy = phase === 'setup' && generating;

  return (
    <View style={styles.screen}>
      {phase === 'list' ? (
        <ListView
          insets={insets}
          quizzes={quizzes}
          error={listError}
          onNewQuiz={openSetup}
          onOpenQuiz={openExistingQuiz}
          onDeleteQuiz={setDeleteTarget}
        />
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
          generating={busy}
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
          onExit={() => {
            setPhase('list');
            void refreshList();
          }}
        />
      ) : phase === 'results' && activeQuiz ? (
        <ResultsView
          insets={insets}
          total={activeQuiz.questions.length}
          score={score}
          bestStreak={bestStreak}
          onStudyAgain={openSetup}
          onDone={() => {
            setPhase('list');
            void refreshList();
          }}
        />
      ) : null}

      {phase === 'list' || phase === 'setup' ? <BottomNav active={activeTab} onSelect={onSelectTab} chatUnread={hasUnread} /> : null}

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete this quiz?"
        message={deleteTarget ? `"${deleteTarget.title}" and your best score will be gone for good.` : undefined}
        confirmLabel={deleting ? 'Deleting…' : 'Delete'}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

function ListView({
  insets,
  quizzes,
  error,
  onNewQuiz,
  onOpenQuiz,
  onDeleteQuiz,
}: {
  insets: { top: number; bottom: number };
  quizzes: QuizSummary[] | null;
  error: string | null;
  onNewQuiz: () => void;
  onOpenQuiz: (summary: QuizSummary) => void;
  onDeleteQuiz: (summary: QuizSummary) => void;
}) {
  return (
    <ScrollView
      contentContainerStyle={[
        styles.content,
        { paddingTop: Math.max(insets.top, 40) + 14, paddingBottom: 130 + insets.bottom },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.intro}>
        <Text style={[type.pageTitle, styles.ink]}>Study</Text>
        <Text style={[type.body, styles.muted]}>Paste your notes. I'll write a quiz to test what actually stuck.</Text>
      </View>

      <Pressable
        onPress={onNewQuiz}
        accessibilityRole="button"
        style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
      >
        <Icon name="plus" size={18} color={colors.onInk} strokeWidth={2.4} />
        <Text style={[type.button, styles.submitLabel]}>New quiz</Text>
      </Pressable>

      {error ? (
        <View style={styles.errorBox}>
          <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
          <Text style={[type.caption, styles.errorText]}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={type.sectionHeading}>Your quizzes</Text>
        {quizzes === null ? (
          <ActivityIndicator color={colors.purple} style={styles.listLoading} />
        ) : quizzes.length === 0 ? (
          <View style={styles.emptyRow}>
            <View style={styles.emptyTile}>
              <Icon name="book" size={18} color={colors.mintText} strokeWidth={2} />
            </View>
            <View style={styles.emptyText}>
              <Text style={[type.taskTitle, styles.ink]}>No quizzes yet</Text>
              <Text style={[type.caption, styles.muted]}>Generate one from your notes above</Text>
            </View>
          </View>
        ) : (
          <Card>
            {quizzes.map((q, i) => (
              <View key={q.id}>
                {i > 0 ? <CardDivider inset={QUIZ_DIVIDER_INSET} /> : null}
                <View style={styles.quizRow}>
                  <Pressable
                    onPress={() => onOpenQuiz(q)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.quizRowMain, pressed && styles.rowPressed]}
                  >
                    <View style={styles.quizIconTile}>
                      <Icon name="book" size={18} color={colors.purple} strokeWidth={1.8} />
                    </View>
                    <View style={styles.quizText}>
                      <Text style={[type.taskTitle, styles.ink]} numberOfLines={1}>
                        {q.title}
                      </Text>
                      <Text style={[type.caption, styles.muted]} numberOfLines={1}>
                        {capitalize(q.difficulty)} · {q.questionCount} questions
                        {q.bestScore != null ? ` · Best ${q.bestScore}/${q.questionCount}` : ''}
                      </Text>
                    </View>
                    <Icon name="chevronRight" size={18} color={colors.faint} strokeWidth={2} />
                  </Pressable>
                  <Pressable
                    onPress={() => onDeleteQuiz(q)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${q.title}`}
                    style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
                  >
                    <Icon name="trash" size={16} color={colors.faint} strokeWidth={1.8} />
                  </Pressable>
                </View>
              </View>
            ))}
          </Card>
        )}
      </View>
    </ScrollView>
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
  generating,
  error,
  onBack,
  onGenerate,
}: {
  insets: { top: number; bottom: number };
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
  generating: boolean;
  error: string | null;
  onBack: () => void;
  onGenerate: () => void;
}) {
  return (
    <KeyboardAvoider style={styles.flex}>
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
            accessibilityRole="button"
            accessibilityLabel="Back"
            disabled={generating}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Icon name="chevronDown" size={20} color={colors.ink} strokeWidth={2} />
          </Pressable>
        </View>

        <View style={styles.intro}>
          <Text style={[type.pageTitle, styles.ink]}>What are you{'\n'}studying?</Text>
          <Text style={[type.body, styles.muted, styles.subtitle]}>
            Paste your notes or attach a syllabus/reading PDF — I'll turn it into a quiz.
          </Text>
        </View>

        <TextInput
          value={studyText}
          onChangeText={onChangeText}
          placeholder="Paste what you're studying…"
          placeholderTextColor={colors.faint}
          multiline
          textAlignVertical="top"
          editable={!generating}
          style={styles.textArea}
        />

        <AttachRow
          label="Attach a PDF instead"
          file={syllabusFile}
          onAttach={onPickFile}
          onRemove={onRemoveFile}
          disabled={generating}
        />

        <View style={styles.section}>
          <Text style={[type.button, styles.ink]}>Difficulty</Text>
          <View style={styles.pillRow}>
            {DIFFICULTIES.map((d) => {
              const active = d === difficulty;
              return (
                <Pressable
                  key={d}
                  onPress={() => onChangeDifficulty(d)}
                  disabled={generating}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[type.button, { color: active ? colors.onInk : colors.muted }]}>{capitalize(d)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[type.button, styles.ink]}>Questions</Text>
          <View style={styles.pillRow}>
            {COUNTS.map((c) => {
              const active = c === questionCount;
              return (
                <Pressable
                  key={c}
                  onPress={() => onChangeQuestionCount(c)}
                  disabled={generating}
                  style={[styles.pill, active && styles.pillActive]}
                >
                  <Text style={[type.button, { color: active ? colors.onInk : colors.muted }]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Icon name="exclamation" size={16} color={colors.redText} strokeWidth={2.2} />
            <Text style={[type.caption, styles.errorText]}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={onGenerate}
          disabled={!canSubmit || generating}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit || generating }}
          style={({ pressed }) => [
            styles.submit,
            (!canSubmit || generating) && styles.submitDisabled,
            pressed && canSubmit && !generating && styles.submitPressed,
          ]}
        >
          {generating ? (
            <>
              <ActivityIndicator color={colors.onInk} />
              <Text style={[type.button, styles.submitLabel]}>Writing your quiz…</Text>
            </>
          ) : (
            <Text style={[type.button, styles.submitLabel]}>Generate quiz →</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoider>
  );
}

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
  insets: { top: number; bottom: number };
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

  return (
    <View style={styles.quizScreen}>
      <View style={[styles.quizHeader, { paddingTop: Math.max(insets.top, 20) + 10 }]}>
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          accessibilityLabel="Exit quiz"
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Icon name="close" size={18} color={colors.ink} strokeWidth={2} />
        </Pressable>
        <View style={styles.quizProgressTrack}>
          <View style={[styles.quizProgressFill, { width: `${(index / total) * 100}%` }]} />
        </View>
        <View style={[styles.streakPill, streak > 0 && styles.streakPillLit]}>
          <Icon name="flame" size={14} color={streak > 0 ? colors.amber : colors.faint} fill={streak > 0 ? colors.amber : 'none'} />
          <Text style={[type.metadata, { color: streak > 0 ? colors.yellowText : colors.faint }]}>{streak}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.quizBody} showsVerticalScrollIndicator={false}>
        <Text style={[type.caption, styles.muted]}>
          Question {index + 1} of {total}
        </Text>
        <Text style={[type.sectionHeading, styles.ink, styles.prompt]}>{question.prompt}</Text>

        {answered && isCorrect ? (
          <View style={styles.xpPop}>
            <Text style={[type.badge, { color: colors.yellowText }]}>+10 XP</Text>
          </View>
        ) : null}

        {answered ? (
          <View style={[styles.explainBox, isCorrect ? styles.explainCorrect : styles.explainWrong]}>
            <Icon
              name={isCorrect ? 'check' : 'close'}
              size={16}
              color={isCorrect ? colors.mintText : colors.redText}
              strokeWidth={2.2}
            />
            <Text style={[type.caption, { color: isCorrect ? colors.mintText : colors.redText }]}>
              {question.explanation}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.choiceZone, { paddingBottom: Math.max(insets.bottom, 12) + 16 }]}>
        {question.choices.map((choice, i) => {
          const isSelected = selected === i;
          const isRightAnswer = i === question.correctIndex;
          const showCorrect = answered && isRightAnswer;
          const showWrong = answered && isSelected && !isRightAnswer;
          return (
            <Pressable
              key={i}
              onPress={() => onAnswer(i)}
              disabled={answered}
              accessibilityRole="button"
              style={[
                styles.choice,
                showCorrect && styles.choiceCorrect,
                showWrong && styles.choiceWrong,
              ]}
            >
              <Text
                style={[
                  type.body,
                  styles.choiceText,
                  showCorrect && styles.choiceTextCorrect,
                  showWrong && styles.choiceTextWrong,
                ]}
              >
                {choice}
              </Text>
              {showCorrect ? <Icon name="check" size={18} color={colors.mintText} strokeWidth={2.4} /> : null}
              {showWrong ? <Icon name="close" size={18} color={colors.redText} strokeWidth={2.4} /> : null}
            </Pressable>
          );
        })}

        {answered ? (
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            style={({ pressed }) => [styles.submit, styles.nextButton, pressed && styles.submitPressed]}
          >
            <Text style={[type.button, styles.submitLabel]}>{isLast ? 'See results →' : 'Next question →'}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ResultsView({
  insets,
  total,
  score,
  bestStreak,
  onStudyAgain,
  onDone,
}: {
  insets: { top: number; bottom: number };
  total: number;
  score: number;
  bestStreak: number;
  onStudyAgain: () => void;
  onDone: () => void;
}) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const message = pct >= 80 ? 'Nailed it.' : pct >= 50 ? 'Good effort.' : 'Worth another pass.';

  return (
    <View style={[styles.resultsScreen, { paddingTop: Math.max(insets.top, 60), paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.resultsCenter}>
        <View style={styles.resultsIconTile}>
          <Icon name="flame" size={28} color={colors.amber} fill={colors.amber} strokeWidth={1.6} />
        </View>
        <Text style={[type.hero, styles.ink]}>
          {score}/{total}
        </Text>
        <Text style={[type.taskTitle, styles.muted]}>{message}</Text>
        {bestStreak > 1 ? (
          <Text style={[type.caption, styles.muted]}>Best streak: {bestStreak} in a row</Text>
        ) : null}
      </View>

      {/* Pinned to the bottom, not centered with the score — the thumb zone is where a decision like this belongs. */}
      <View style={styles.resultsActions}>
        <Pressable
          onPress={onStudyAgain}
          accessibilityRole="button"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={[type.button, styles.ink]}>Study again</Text>
        </Pressable>
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          style={({ pressed }) => [styles.submit, styles.buildButton, pressed && styles.submitPressed]}
        >
          <Text style={[type.button, styles.submitLabel]}>Done</Text>
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
  flex: {
    flex: 1,
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
  subtitle: {
    marginTop: 4,
  },
  section: {
    gap: 10,
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
  listLoading: {
    paddingVertical: 24,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
  },
  emptyTile: {
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: layout.iconTileRadius,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    flex: 1,
    gap: 2,
  },
  quizRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
  },
  quizRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  quizIconTile: {
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: layout.iconTileRadius,
    backgroundColor: colors.purpleSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonPressed: {
    backgroundColor: colors.redSoft,
  },
  textArea: {
    minHeight: 180,
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
  pillRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  // Quiz player
  quizScreen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  quizHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: 14,
  },
  quizProgressTrack: {
    flex: 1,
    height: layout.progressBarHeight,
    borderRadius: layout.progressBarHeight / 2,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  quizProgressFill: {
    height: '100%',
    borderRadius: layout.progressBarHeight / 2,
    backgroundColor: colors.purple,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: layout.pillHeight,
    paddingHorizontal: 10,
    borderRadius: layout.pillRadius,
    backgroundColor: colors.surfaceMuted,
  },
  streakPillLit: {
    backgroundColor: colors.yellowSoft,
  },
  quizBody: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: 8,
    gap: 14,
  },
  prompt: {
    marginTop: 2,
  },
  xpPop: {
    alignSelf: 'flex-start',
    backgroundColor: colors.yellowSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  explainBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 14,
    padding: 14,
  },
  explainCorrect: {
    backgroundColor: colors.mint,
  },
  explainWrong: {
    backgroundColor: colors.redSoft,
  },
  choiceZone: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: 10,
    gap: 10,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 56,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  choiceCorrect: {
    backgroundColor: colors.mint,
    borderColor: colors.green,
  },
  choiceWrong: {
    backgroundColor: colors.redSoft,
    borderColor: colors.red,
  },
  choiceText: {
    flex: 1,
    color: colors.ink,
  },
  choiceTextCorrect: {
    color: colors.mintText,
  },
  choiceTextWrong: {
    color: colors.redText,
  },
  nextButton: {
    marginTop: 4,
  },
  // Results
  resultsScreen: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
  },
  resultsCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  resultsIconTile: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.yellowSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  resultsActions: {
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
    flex: 1,
  },
});

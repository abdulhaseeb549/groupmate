import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassButton } from '../Glass';
import { GradientButton, SecondaryButton } from '../GradientButton';
import { FadeIn } from '../FadeIn';
import { Icon } from '../Icon';
import { KeyboardAvoider } from '../KeyboardAvoider';
import { colors, type } from '../../theme';
import { getAnswerPhoto, AnswerPhoto } from '../../utils/answerPhoto';
import {
  formatMarks,
  MarkedAnswer,
  markWritten,
  SECONDS_PER_MARK,
  totalMarks,
  WRITTEN_KIND_LABEL,
  WrittenQuestion,
  WrittenQuiz,
} from '../../state/writtenQuiz';

type Props = {
  quiz: WrittenQuiz;
  /** Called when the quiz ends: the marks per question (null = skipped). */
  onFinish: (results: (MarkedAnswer | null)[]) => void;
  onExit: () => void;
  /** After the result screen: make new questions from what lost marks. */
  onPractiseMissed: (results: (MarkedAnswer | null)[]) => void;
  practising: boolean;
  practiseError: string | null;
};

type Step = 'writing' | 'marking' | 'marked' | 'done';

const TONE = {
  mint: { bg: colors.mint, fg: colors.mintText, word: 'Good' },
  amber: { bg: colors.yellowSoft, fg: colors.yellowText, word: 'Nearly there' },
  coral: { bg: colors.redSoft, fg: colors.redText, word: 'Needs work' },
};

/** Mint at 80% and up, amber from half, coral below: the same rule as the MCQ score. */
function tone(got: number, outOf: number) {
  const share = outOf > 0 ? got / outOf : 0;
  return share >= 0.8 ? TONE.mint : share >= 0.5 ? TONE.amber : TONE.coral;
}

function wordCount(text: string) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function clock(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Written answers, one question at a time: write (or photograph) the answer,
 * get it marked point by point, see the model answer, move on. The marks of
 * every question end on one result screen.
 */
export function WrittenPlayer({ quiz, onFinish, onExit, onPractiseMissed, practising, practiseError }: Props) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<Step>('writing');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<AnswerPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<(MarkedAnswer | null)[]>(() => quiz.questions.map(() => null));
  const [showModel, setShowModel] = useState(false);
  const [showViva, setShowViva] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() => totalMarks(quiz) * SECONDS_PER_MARK);

  const question: WrittenQuestion = quiz.questions[index];
  const total = quiz.questions.length;
  const marked = results[index];

  // The paper's clock runs while a question is being written, and stops at 0:00
  // without cutting the student off.
  useEffect(() => {
    if (step === 'done') return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [step]);

  const canCheck = (text.trim().length > 0 || photo !== null) && step === 'writing';

  async function check() {
    setError(null);
    setStep('marking');
    const out = await markWritten(question, { text: text.trim() || undefined, imageBase64: photo?.base64 });
    if (!out.marked) {
      setError(out.error);
      setStep('writing');
      return;
    }
    setResults((r) => r.map((x, i) => (i === index ? out.marked : x)));
    setShowModel(false);
    setShowViva(false);
    setStep('marked');
  }

  function next(finalResults: (MarkedAnswer | null)[]) {
    if (index + 1 >= total) {
      setStep('done');
      onFinish(finalResults);
      return;
    }
    setIndex(index + 1);
    setText('');
    setPhoto(null);
    setError(null);
    setStep('writing');
  }

  async function snap() {
    setError(null);
    const { photo: taken, error: photoError } = await getAnswerPhoto();
    if (photoError) setError(photoError);
    if (taken) setPhoto(taken);
  }

  const progress = (index + (step === 'marked' ? 1 : 0)) / total;

  if (step === 'done') {
    return (
      <ResultView
        quiz={quiz}
        results={results}
        secondsUsed={totalMarks(quiz) * SECONDS_PER_MARK - secondsLeft}
        onDone={onExit}
        onPractise={() => onPractiseMissed(results)}
        practising={practising}
        error={practiseError}
      />
    );
  }

  return (
    <View style={styles.flex}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 40) + 6 }]}>
        <GlassButton onPress={onExit} label="Exit quiz">
          <Icon name="close" size={18} color={colors.ink} strokeWidth={2} />
        </GlassButton>
        <View
          style={styles.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`Question ${index + 1} of ${total}`}
        >
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <View
          style={styles.timer}
          accessible
          accessibilityRole="timer"
          accessibilityLabel={`${clock(secondsLeft)} left`}
        >
          <Icon name="clock" size={14} color={colors.ink} strokeWidth={2} />
          <Text style={styles.timerText}>{clock(secondsLeft)}</Text>
        </View>
      </View>

      {step === 'marked' && marked ? (
        <MarkedView
          question={question}
          marked={marked}
          index={index}
          total={total}
          showModel={showModel}
          onToggleModel={() => setShowModel((v) => !v)}
          showViva={showViva}
          onToggleViva={() => setShowViva((v) => !v)}
          isLast={index + 1 >= total}
          onNext={() => next(results)}
          bottom={insets.bottom}
        />
      ) : (
        <KeyboardAvoider style={styles.flex}>
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.row}>
              <Text style={styles.eyebrow}>
                {index + 1} of {total}
              </Text>
              <View style={[styles.pill, { backgroundColor: 'rgba(21,21,26,0.05)' }]}>
                {question.kind === 'practical' ? <Icon name="flask" size={13} color={colors.muted} strokeWidth={2} /> : null}
                <Text style={[styles.pillText, { color: colors.muted }]}>
                  {question.kind === 'practical' ? `Practical · ${question.marks} marks` : `${question.marks} marks`}
                </Text>
              </View>
            </View>
            <Text style={styles.prompt} accessibilityRole="header">
              {question.prompt}
            </Text>
            <Text style={styles.m}>
              {question.kind === 'practical'
                ? 'Write the steps in order'
                : `About ${Math.max(20, question.marks * 25)} words`}
            </Text>

            <View style={[styles.card, styles.answerCard]}>
              {photo ? (
                <View style={styles.photoRow}>
                  <Image source={{ uri: photo.uri }} style={styles.photo} accessibilityLabel="Your page" />
                  <View style={styles.flexText}>
                    <Text style={styles.t}>Your page</Text>
                    <Text style={styles.m}>The AI reads your handwriting</Text>
                  </View>
                  <Pressable
                    onPress={() => setPhoto(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove photo"
                    hitSlop={8}
                    style={styles.removeBtn}
                  >
                    <Icon name="close" size={14} color={colors.muted} strokeWidth={2.4} />
                  </Pressable>
                </View>
              ) : (
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={question.kind === 'practical' ? '1. First step…' : 'Write your answer'}
                  placeholderTextColor={colors.faint}
                  multiline
                  textAlignVertical="top"
                  editable={step === 'writing'}
                  accessibilityLabel="Your answer"
                  style={styles.answer}
                />
              )}
              <View style={styles.answerFoot}>
                <Pressable
                  onPress={snap}
                  accessibilityRole="button"
                  accessibilityLabel="Snap a photo of your answer on paper"
                  style={({ pressed }) => [styles.snap, pressed && styles.pressed]}
                >
                  <Icon name="camera" size={18} color={colors.purple} strokeWidth={1.9} />
                  <Text style={styles.snapText}>{photo ? 'Retake' : 'Snap paper instead'}</Text>
                </Pressable>
                {photo ? null : <Text style={styles.m}>{wordCount(text)} words</Text>}
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 0) + 20 }]}>
            <GradientButton
              label={step === 'marking' ? 'Checking…' : 'Check my answer'}
              onPress={check}
              disabled={!canCheck}
              loading={step === 'marking'}
              style={styles.full}
            />
            <Pressable
              onPress={() => next(results)}
              disabled={step === 'marking'}
              accessibilityRole="button"
              style={({ pressed }) => [styles.skip, pressed && styles.pressed]}
            >
              <Text style={styles.skipText}>Skip for now</Text>
            </Pressable>
          </View>
        </KeyboardAvoider>
      )}
    </View>
  );
}

function MarkedView({
  question,
  marked,
  index,
  total,
  showModel,
  onToggleModel,
  showViva,
  onToggleViva,
  isLast,
  onNext,
  bottom,
}: {
  question: WrittenQuestion;
  marked: MarkedAnswer;
  index: number;
  total: number;
  showModel: boolean;
  onToggleModel: () => void;
  showViva: boolean;
  onToggleViva: () => void;
  isLast: boolean;
  onNext: () => void;
  bottom: number;
}) {
  const t = tone(marked.total, marked.outOf);
  const practical = question.kind === 'practical';
  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <View style={styles.row}>
            <Text style={styles.eyebrow}>
              {index + 1} of {total} · checked
            </Text>
            {practical ? (
              <View style={[styles.pill, { backgroundColor: 'rgba(21,21,26,0.05)' }]}>
                <Icon name="flask" size={13} color={colors.muted} strokeWidth={2} />
                <Text style={[styles.pillText, { color: colors.muted }]}>Practical</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.scoreRow}>
            <Text style={styles.score} accessibilityLabel={`${formatMarks(marked.total)} out of ${marked.outOf} marks`}>
              {formatMarks(marked.total)}
            </Text>
            <Text style={styles.of}>/ {marked.outOf}</Text>
            <View style={[styles.pill, styles.scorePill, { backgroundColor: t.bg }]}>
              <Text style={[styles.pillText, { color: t.fg }]}>{t.word}</Text>
            </View>
          </View>
          <Text style={styles.qEcho}>{question.prompt}</Text>
        </FadeIn>

        <FadeIn delay={60}>
          <View style={styles.card} accessibilityRole="list" accessibilityLabel={practical ? 'Your steps' : 'Marking'}>
            {marked.points.map((p, i) => (
              <View key={i}>
                {i > 0 ? <View style={styles.hair} /> : null}
                <PointRow point={p} step={practical ? i + 1 : null} />
              </View>
            ))}
          </View>
        </FadeIn>

        {marked.feedback ? (
          <FadeIn delay={90}>
            <Text style={styles.feedback}>{marked.feedback}</Text>
          </FadeIn>
        ) : null}

        <FadeIn delay={110}>
          <Pressable
            onPress={onToggleModel}
            accessibilityRole="button"
            accessibilityState={{ expanded: showModel }}
            style={({ pressed }) => [styles.card, styles.modelRow, pressed && styles.pressed]}
          >
            <Icon name="book" size={19} color={colors.ink} strokeWidth={1.8} />
            <Text style={[styles.t, styles.flexText]}>Model answer</Text>
            <Icon name={showModel ? 'chevronUp' : 'chevronDown'} size={18} color={colors.faint} strokeWidth={2} />
          </Pressable>
          {showModel ? (
            <View style={[styles.card, styles.modelBody]}>
              <Text style={styles.modelText}>{question.modelAnswer || question.scheme.map((s) => s.point).join('. ')}</Text>
            </View>
          ) : null}
        </FadeIn>

        {practical && question.viva ? (
          <FadeIn delay={130}>
            <View style={[styles.card, styles.vivaCard]}>
              <Text style={styles.eyebrow}>Viva question</Text>
              <View style={styles.row}>
                <Text style={[styles.vivaQ, styles.flexText]}>{question.viva.question}</Text>
                <Pressable
                  onPress={onToggleViva}
                  accessibilityRole="button"
                  accessibilityLabel={showViva ? 'Hide the viva answer' : 'Show the viva answer'}
                  style={({ pressed }) => [styles.vivaBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.snapText}>{showViva ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              {showViva ? <Text style={styles.m}>{question.viva.answer}</Text> : null}
            </View>
          </FadeIn>
        ) : null}
        <View style={{ height: 96 + bottom }} />
      </ScrollView>

      <View style={[styles.bottom, styles.bottomFloat, { paddingBottom: Math.max(bottom, 0) + 20 }]}>
        <GradientButton label={isLast ? 'See my marks' : 'Next question'} onPress={onNext} style={styles.full} />
      </View>
    </View>
  );
}

/** One scheme point: tick, half, or cross, the point, and what was missing. */
function PointRow({ point, step }: { point: MarkedAnswer['points'][number]; step: number | null }) {
  const full = point.got >= point.marks;
  const none = point.got <= 0;
  const color = full ? colors.mintText : none ? colors.redText : colors.yellowText;
  const bg = full ? colors.mint : none ? colors.redSoft : colors.yellowSoft;
  const gotLabel = full ? `+${formatMarks(point.got)}` : none ? '0' : `+${formatMarks(point.got)}`;
  return (
    <View
      style={styles.pointRow}
      accessibilityRole="text"
      accessibilityLabel={`${point.point}. ${full ? 'Full marks' : none ? 'No marks' : 'Half marks'}, ${formatMarks(point.got)} of ${point.marks}`}
    >
      <View style={[styles.mark, { backgroundColor: bg }]}>
        {step !== null && full ? (
          <Text style={[styles.stepNo, { color }]}>{step}</Text>
        ) : (
          <Icon name={full ? 'check' : none ? 'close' : 'minus'} size={14} color={color} strokeWidth={2.8} />
        )}
      </View>
      <View style={styles.flexText}>
        <Text style={styles.t}>{point.point}</Text>
        {point.note ? <Text style={styles.m}>{point.note}</Text> : null}
      </View>
      <Text style={[styles.got, { color }]}>{gotLabel}</Text>
    </View>
  );
}

function ResultView({
  quiz,
  results,
  secondsUsed,
  onDone,
  onPractise,
  practising,
  error,
}: {
  quiz: WrittenQuiz;
  results: (MarkedAnswer | null)[];
  secondsUsed: number;
  onDone: () => void;
  onPractise: () => void;
  practising: boolean;
  error: string | null;
}) {
  const insets = useSafeAreaInsets();
  const out = totalMarks(quiz);
  const got = useMemo(() => results.reduce((n, r) => n + (r ? r.total : 0), 0), [results]);
  const percent = out > 0 ? Math.round((got / out) * 100) : 0;
  const t = tone(got, out);
  const missed = out - got;

  return (
    <View style={styles.flex}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 40) + 6 }]}>
        <GlassButton onPress={onDone} label="Close">
          <Icon name="close" size={18} color={colors.ink} strokeWidth={2} />
        </GlassButton>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <FadeIn>
          <Text style={styles.eyebrow}>{quiz.title} · written</Text>
          <View style={[styles.scoreRow, { marginTop: 14 }]}>
            <Text
              style={[styles.score, { fontSize: 64, lineHeight: 64 }]}
              accessibilityLabel={`${formatMarks(got)} out of ${out} marks`}
            >
              {formatMarks(got)}
            </Text>
            <Text style={styles.of}>/ {out}</Text>
            <View style={[styles.pill, styles.scorePill, { backgroundColor: t.bg }]}>
              <Text style={[styles.pillText, { color: t.fg }]}>{percent}%</Text>
            </View>
          </View>
          <Text style={[styles.m, { marginTop: 6 }]}>
            {quiz.questions.length} questions · {Math.max(1, Math.round(secondsUsed / 60))} min
          </Text>
        </FadeIn>

        <FadeIn delay={60}>
          <View style={styles.card} accessibilityRole="list" accessibilityLabel="Your marks">
            {quiz.questions.map((q, i) => {
              const r = results[i];
              const rt = r ? tone(r.total, r.outOf) : { bg: 'rgba(21,21,26,0.05)', fg: colors.muted };
              return (
                <View key={i}>
                  {i > 0 ? <View style={[styles.hair, { marginLeft: 64 }]} /> : null}
                  <View style={styles.resultRow} accessibilityRole="text">
                    <View style={[styles.pill, styles.kindPill]}>
                      {q.kind === 'practical' ? (
                        <Icon name="flask" size={13} color={colors.muted} strokeWidth={2} />
                      ) : (
                        <Text style={[styles.pillText, { color: colors.muted }]}>{q.marks}</Text>
                      )}
                    </View>
                    <Text style={[styles.t, styles.flexText]} numberOfLines={2}>
                      {q.prompt}
                    </Text>
                    <View style={[styles.pill, { backgroundColor: rt.bg }]}>
                      <Text style={[styles.pillText, { color: rt.fg }]}>
                        {r ? `${formatMarks(r.total)} / ${r.outOf}` : 'Skipped'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
          {missed > 0 ? (
            <Text style={[styles.m, styles.missed]}>{formatMarks(missed)} marks missed</Text>
          ) : null}
        </FadeIn>

        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <View style={{ height: 150 + insets.bottom }} />
      </ScrollView>

      <View style={[styles.bottom, styles.bottomFloat, { paddingBottom: Math.max(insets.bottom, 0) + 20 }]}>
        {missed > 0 ? (
          <GradientButton
            label="Practise what I missed"
            onPress={onPractise}
            loading={practising}
            style={styles.full}
          />
        ) : null}
        <SecondaryButton label="Done" onPress={onDone} style={styles.full} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  full: { alignSelf: 'stretch' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.purple },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(21,21,26,0.05)',
  },
  timerText: {
    fontFamily: type.badge.fontFamily,
    fontSize: 14,
    lineHeight: 18,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  body: { paddingHorizontal: 20, paddingTop: 36, paddingBottom: 24, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: {
    fontFamily: type.metadata.fontFamily,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  pill: { height: 24, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillText: { fontFamily: type.badge.fontFamily, fontSize: 12, lineHeight: 16 },
  prompt: {
    fontFamily: type.pageTitle.fontFamily,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.6,
    color: colors.ink,
  },
  t: { fontFamily: type.taskTitle.fontFamily, fontSize: 15, lineHeight: 21, color: colors.ink },
  m: { fontFamily: type.caption.fontFamily, fontSize: 13, lineHeight: 18, color: colors.muted },
  flexText: { flex: 1, minWidth: 0, gap: 2 },
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
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 54 },
  answerCard: { padding: 16, paddingBottom: 6, gap: 10, minHeight: 230, marginTop: 4 },
  answer: {
    flex: 1,
    minHeight: 160,
    fontFamily: type.body.fontFamily,
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
    padding: 0,
  },
  answerFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  snap: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44 },
  snapText: { fontFamily: type.button.fontFamily, fontSize: 14, lineHeight: 20, color: colors.purple },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 160 },
  photo: { width: 84, height: 112, borderRadius: 10, backgroundColor: colors.surfaceMuted },
  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(21,21,26,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { paddingHorizontal: 20, paddingTop: 12, alignItems: 'center', gap: 4 },
  bottomFloat: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 10 },
  skip: { height: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  skipText: { fontFamily: type.taskTitle.fontFamily, fontSize: 14, color: colors.muted },
  pressed: { opacity: 0.6 },
  errorBox: { padding: 14, borderRadius: 16, backgroundColor: colors.redSoft },
  errorText: { fontFamily: type.caption.fontFamily, fontSize: 14, lineHeight: 20, color: colors.redText },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 10 },
  score: {
    fontFamily: type.hero.fontFamily,
    fontSize: 56,
    lineHeight: 56,
    letterSpacing: -1.5,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  of: { fontFamily: type.pageTitle.fontFamily, fontSize: 20, lineHeight: 26, color: colors.muted, marginBottom: 4 },
  scorePill: { marginLeft: 'auto', marginBottom: 8 },
  qEcho: { fontFamily: type.subtitle.fontFamily, fontSize: 14, lineHeight: 20, color: colors.muted },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  mark: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: -1 },
  stepNo: { fontFamily: type.badge.fontFamily, fontSize: 12, lineHeight: 16 },
  got: { fontFamily: type.badge.fontFamily, fontSize: 14, lineHeight: 21, fontVariant: ['tabular-nums'] },
  feedback: { fontFamily: type.subtitle.fontFamily, fontSize: 14, lineHeight: 20, color: colors.ink, paddingHorizontal: 4 },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, paddingHorizontal: 16 },
  modelBody: { padding: 16, marginTop: 8 },
  modelText: { fontFamily: type.body.fontFamily, fontSize: 15, lineHeight: 22, color: colors.ink },
  vivaCard: { padding: 14, paddingHorizontal: 16, gap: 6 },
  vivaQ: { fontFamily: type.taskTitle.fontFamily, fontSize: 15, lineHeight: 21, color: colors.ink },
  vivaBtn: { height: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 64 },
  kindPill: { width: 36, paddingHorizontal: 0, justifyContent: 'center', backgroundColor: 'rgba(21,21,26,0.05)' },
  missed: { paddingHorizontal: 4, marginTop: 10 },
});

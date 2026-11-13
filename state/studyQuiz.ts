import { supabase } from '../lib/supabase';
import { PdfFileInput } from '../utils/pdfPicker';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type ExtractedQuestion = {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
};

export type ExtractedQuiz = {
  title: string;
  questions: ExtractedQuestion[];
};

/** One swipeable revision card — the short pointers drawn from the same upload as the quiz. */
export type NotePage = {
  eyebrow: string;
  heading: string;
  points: string[];
};

export type QuizSummary = {
  id: string;
  title: string;
  difficulty: Difficulty;
  questionCount: number;
  bestScore: number | null;
  /** How many pointer cards this set has. 0 when notes were never generated (every quiz made before they existed) or generation failed. */
  noteCount: number;
  /** Someone else's quiz you joined with a code (you can take it, not edit or delete it). */
  joined: boolean;
};

type RawQuizQuestion = {
  prompt: string;
  choiceA: string;
  choiceB: string;
  choiceC: string;
  choiceD: string;
  correctChoice: 'A' | 'B' | 'C' | 'D';
  explanation: string;
};

const LETTERS = ['A', 'B', 'C', 'D'] as const;

type GenerateResult = { quiz: ExtractedQuiz; error: null } | { quiz: null; error: string };

export type GenerateQuizInput = {
  /** Typed/pasted notes. Alongside a file it's treated as additional focus, not a replacement. */
  studyText?: string;
  /** A syllabus, textbook chapter, or lecture-notes PDF to quiz on directly. */
  syllabusFile?: PdfFileInput;
  /** From uploadMaterial(): the PDF already uploaded, sent instead of syllabusFile. */
  fileToken?: string;
  /** Parts mode: all parts of one quiz share batchId (the daily cap counts it once). */
  batchId?: string;
  part?: number;
  partCount?: number;
  difficulty: Difficulty;
  questionCount: number;
};

/**
 * Calls the generate-quiz Edge Function — generation only, nothing is
 * persisted yet. Unlike brief-parsing there's no destructive commit to
 * review here (a new quiz never overwrites anything); commitQuiz below
 * just saves it so it's there next time and can track a best score.
 */
export async function generateQuiz(input: GenerateQuizInput): Promise<GenerateResult> {
  const { data, error } = await supabase.functions.invoke<{
    extracted?: { title: string; questions: RawQuizQuestion[] };
    error?: string;
  }>('generate-quiz', { body: input });

  if (error) {
    // A non-2xx (the daily cap, a bad count) carries its own message in the
    // body; invoke() only says "non-2xx", so read the body when there is one.
    let message: string | undefined;
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body && typeof body.error === 'string') message = body.error;
    } catch {
      // not JSON: fall through to the generic message
    }
    return { quiz: null, error: message ?? 'Could not reach the AI right now.' };
  }
  if (!data || data.error || !data.extracted) {
    return { quiz: null, error: data?.error ?? 'Something went wrong generating that quiz.' };
  }

  const questions = data.extracted.questions.map((q) => ({
    prompt: q.prompt,
    choices: [q.choiceA, q.choiceB, q.choiceC, q.choiceD],
    correctIndex: LETTERS.indexOf(q.correctChoice),
    explanation: q.explanation,
  }));

  return { quiz: { title: data.extracted.title, questions }, error: null };
}

/**
 * Calls the generate-notes Edge Function on the same material the quiz
 * came from. Kept separate from generateQuiz so the two can be fired
 * together and fail independently: a student who waited on an upload
 * should still get their quiz when the pointers 429, and the notes column
 * stays null for a later retry rather than taking the quiz down with it.
 */
export async function generateNotes(
  input: Pick<GenerateQuizInput, 'studyText' | 'syllabusFile'>
): Promise<{ pages: NotePage[] | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{
    extracted?: { pages: NotePage[] };
    error?: string;
  }>('generate-notes', { body: input });

  if (error) {
    return { pages: null, error: error.message ?? 'Could not reach the AI right now.' };
  }
  if (!data || data.error || !data.extracted) {
    return { pages: null, error: data?.error ?? 'Something went wrong writing those pointers.' };
  }
  return { pages: data.extracted.pages, error: null };
}

/** Saves a generated quiz as a new row so it's there next time and can track a best score. */
export async function commitQuiz(
  quiz: ExtractedQuiz,
  difficulty: Difficulty,
  /** Null when generate-notes failed — the quiz is still worth saving without them. */
  notes: NotePage[] | null = null
): Promise<{ quizId: string | null; error: string | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { quizId: null, error: 'Not authenticated.' };

    const { data: quizRow, error: quizError } = await supabase
      .from('quizzes')
      .insert({
        owner_id: user.id,
        title: quiz.title,
        difficulty,
        question_count: quiz.questions.length,
        notes,
      })
      .select('id')
      .single();
    if (quizError) throw quizError;

    const rows = quiz.questions.map((q, i) => ({
      quiz_id: quizRow.id,
      prompt: q.prompt,
      choices: q.choices,
      correct_index: q.correctIndex,
      explanation: q.explanation,
      position: i + 1,
    }));
    const { error: questionsError } = await supabase.from('quiz_questions').insert(rows);
    if (questionsError) throw questionsError;

    return { quizId: quizRow.id as string, error: null };
  } catch (err) {
    return { quizId: null, error: err instanceof Error ? err.message : 'Could not save this quiz.' };
  }
}

/** RLS scopes this to quizzes the caller owns; quiz_questions cascade-delete with it. */
export async function deleteQuiz(quizId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('quizzes').delete().eq('id', quizId);
  return { error: error?.message ?? null };
}

export async function fetchQuizzes(userId: string): Promise<QuizSummary[]> {
  const { data, error } = await supabase
    .from('quizzes')
    // No owner filter: RLS returns your own quizzes plus the ones you joined
    // with a code (migration 0027).
    .select('id, owner_id, title, difficulty, question_count, best_score, notes')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    difficulty: row.difficulty as Difficulty,
    questionCount: row.question_count as number,
    bestScore: row.best_score as number | null,
    noteCount: Array.isArray(row.notes) ? (row.notes as NotePage[]).length : 0,
    joined: row.owner_id !== userId,
  }));
}

export async function fetchQuizQuestions(quizId: string): Promise<ExtractedQuestion[]> {
  const { data, error } = await supabase
    .from('quiz_questions')
    .select('prompt, choices, correct_index, explanation')
    .eq('quiz_id', quizId)
    .order('position', { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    prompt: row.prompt as string,
    choices: row.choices as string[],
    correctIndex: row.correct_index as number,
    explanation: row.explanation as string,
  }));
}

/** Fire-and-forget, same pattern as ProjectRepository's persist calls — only updates if this beats the existing best. */
export async function recordBestScore(quizId: string, score: number): Promise<void> {
  const { data } = await supabase.from('quizzes').select('best_score').eq('id', quizId).single();
  if (data && data.best_score !== null && data.best_score >= score) return;
  await supabase.from('quizzes').update({ best_score: score }).eq('id', quizId);
}

/**
 * The pointer cards for one quiz, fetched on open rather than with the
 * list: a set of eight cards is far more text than every list row combined,
 * and most sessions never open them.
 */
export async function fetchQuizNotes(quizId: string): Promise<NotePage[]> {
  const { data, error } = await supabase.from('quizzes').select('notes').eq('id', quizId).maybeSingle();
  if (error) throw error;
  const notes = data?.notes;
  return Array.isArray(notes) ? (notes as NotePage[]) : [];
}

/**
 * Fills in pointers for a quiz that has none — one made before notes
 * existed, or one whose generation failed. Needs the original material
 * again, since nothing stores the upload after the quiz is built.
 */
export async function attachQuizNotes(quizId: string, pages: NotePage[]): Promise<{ error: string | null }> {
  const { error } = await supabase.from('quizzes').update({ notes: pages }).eq('id', quizId);
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Faster quizzes (13 Nov): upload once, write in small parallel parts
// ---------------------------------------------------------------------------

/**
 * Sends the PDF to upload-material the moment it's picked, while the
 * student is still choosing difficulty and count. Generate then sends a
 * short token instead of the whole file, twice (quiz + notes).
 */
export async function uploadMaterial(file: PdfFileInput): Promise<{ token: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ fileToken?: string; error?: string }>('upload-material', {
    body: { filename: file.filename, base64: file.base64 },
  });
  if (error || !data?.fileToken) return { token: null, error: data?.error ?? 'Could not upload that PDF.' };
  return { token: data.fileToken, error: null };
}

/** Questions per part. Small parts finish fast, so the first one starts the quiz. */
export const QUESTIONS_PER_PART = 5;

function newBatchId(): string {
  // v4-shaped id from Math.random: it only groups one quiz's parts together.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function splitEvenly(total: number, parts: number): number[] {
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Writes the quiz as parallel parts of ~5 questions, each covering its own
 * section of the material. `onProgress` fires as each part lands with the
 * questions so far (repeats across parts dropped), so the quiz can start on
 * the first one. Resolves with the whole quiz once every part settles.
 */
export async function generateQuizParts(
  input: GenerateQuizInput,
  onProgress: (quiz: ExtractedQuiz, settled: number, parts: number) => void
): Promise<GenerateResult> {
  const partCount = Math.max(1, Math.ceil(input.questionCount / QUESTIONS_PER_PART));
  const sizes = splitEvenly(input.questionCount, partCount);
  const batchId = newBatchId();
  const { syllabusFile, fileToken, ...rest } = input;
  const material = fileToken ? { fileToken } : { syllabusFile };

  let title = '';
  const questions: ExtractedQuestion[] = [];
  const seen = new Set<string>();
  let settled = 0;
  let firstError: string | null = null;

  await Promise.all(
    sizes.map(async (size, i) => {
      const result = await generateQuiz({
        ...rest,
        ...material,
        questionCount: size,
        batchId,
        part: i + 1,
        partCount,
      });
      settled += 1;
      if (!result.quiz) {
        firstError ??= result.error;
      } else {
        // Part 1 names the whole quiz; any part's title beats none.
        if (i === 0 || !title) title = result.quiz.title;
        for (const q of result.quiz.questions) {
          const key = norm(q.prompt);
          if (seen.has(key)) continue;
          seen.add(key);
          questions.push(q);
        }
      }
      if (questions.length > 0) onProgress({ title: title || 'Quiz', questions: [...questions] }, settled, partCount);
    })
  );

  if (questions.length === 0) return { quiz: null, error: firstError ?? 'Something went wrong generating that quiz.' };
  return { quiz: { title: title || 'Quiz', questions }, error: null };
}

// ---------------------------------------------------------------------------
// Friends leaderboard (migration 0027)
// ---------------------------------------------------------------------------

export type LeaderRow = {
  userId: string;
  name: string;
  initials: string;
  avatarBg: string | null;
  avatarFg: string | null;
  score: number;
  total: number;
  durationMs: number;
  attempts: number;
  rank: number;
  isMe: boolean;
};

/** Saves one finished attempt. The board ranks each person's first one. */
export async function recordAttempt(quizId: string, score: number, total: number, durationMs: number): Promise<void> {
  const duration = Math.max(0, Math.min(7_200_000, Math.round(durationMs)));
  await supabase.from('quiz_attempts').insert({ quiz_id: quizId, score, total, duration_ms: duration });
}

export async function shareQuiz(quizId: string): Promise<{ code: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('share_quiz', { p_quiz_id: quizId });
  if (error || typeof data !== 'string') return { code: null, error: 'Could not make a code. Try again.' };
  return { code: data, error: null };
}

export async function joinQuiz(code: string): Promise<{ quizId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('join_quiz', { p_code: code });
  if (error || typeof data !== 'string') {
    const notFound = error?.message?.includes('No quiz has that code');
    return { quizId: null, error: notFound ? 'No quiz has that code. Check it and try again.' : 'Could not join. Try again.' };
  }
  return { quizId: data, error: null };
}

export async function fetchLeaderboard(quizId: string): Promise<LeaderRow[]> {
  const { data, error } = await supabase.rpc('quiz_leaderboard', { p_quiz_id: quizId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    userId: r.user_id,
    name: r.full_name ?? 'Student',
    initials: r.initials ?? '··',
    avatarBg: r.avatar_bg,
    avatarFg: r.avatar_fg,
    score: r.score,
    total: r.total,
    durationMs: r.duration_ms,
    attempts: r.attempts,
    rank: r.rank,
    isMe: r.is_me,
  }));
}

export async function fetchMemberCount(quizId: string): Promise<number> {
  const { data } = await supabase.rpc('quiz_member_count', { p_quiz_id: quizId });
  return typeof data === 'number' ? data : 1;
}

/** "1:32" for a duration. */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Takes a friend's quiz off your list (quiz_members row). Your attempts stay on their board. */
export async function leaveQuiz(quizId: string): Promise<{ error: string | null }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };
  const { error } = await supabase.from('quiz_members').delete().eq('quiz_id', quizId).eq('user_id', user.id);
  return { error: error ? 'Could not leave. Try again.' : null };
}

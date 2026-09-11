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

export type QuizSummary = {
  id: string;
  title: string;
  difficulty: Difficulty;
  questionCount: number;
  bestScore: number | null;
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
    return { quiz: null, error: error.message ?? 'Could not reach the AI right now.' };
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

/** Saves a generated quiz as a new row so it's there next time and can track a best score. */
export async function commitQuiz(
  quiz: ExtractedQuiz,
  difficulty: Difficulty
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
    .select('id, title, difficulty, question_count, best_score')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    difficulty: row.difficulty as Difficulty,
    questionCount: row.question_count as number,
    bestScore: row.best_score as number | null,
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

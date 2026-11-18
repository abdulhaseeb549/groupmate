import { supabase } from '../lib/supabase';
import { PdfFileInput } from '../utils/pdfPicker';

// Written answers: 2, 5 and 10-mark questions and practicals, marked point by
// point. The questions and their marking schemes are written by the
// `written-quiz` Edge Function and saved as one row (migration 0030).

export type WrittenKind = 'short' | 'medium' | 'long' | 'practical';

export type SchemePoint = { point: string; marks: number };

export type WrittenQuestion = {
  kind: WrittenKind;
  marks: number;
  prompt: string;
  /** What an examiner gives marks for; the marks add up to `marks`. */
  scheme: SchemePoint[];
  modelAnswer: string;
  /** Practicals: a likely viva question and a short model reply. */
  viva?: { question: string; answer: string };
};

export type WrittenQuiz = { title: string; questions: WrittenQuestion[] };

export type MarkedPoint = { point: string; marks: number; got: number; note: string };

export type MarkedAnswer = { total: number; outOf: number; points: MarkedPoint[]; feedback: string };

export type WrittenSummary = {
  id: string;
  title: string;
  questionCount: number;
  totalMarks: number;
  bestMarks: number | null;
};

export const WRITTEN_KIND_LABEL: Record<WrittenKind, string> = {
  short: '2 marks',
  medium: '5 marks',
  long: '10 marks',
  practical: 'Practical',
};

export const WRITTEN_COUNTS = [3, 5, 8] as const;

/** One minute per mark, like a real paper. */
export const SECONDS_PER_MARK = 60;

export function totalMarks(quiz: WrittenQuiz): number {
  return quiz.questions.reduce((n, q) => n + q.marks, 0);
}

/** "3.5", "16": a half mark shows, a whole mark doesn't carry ".0". */
export function formatMarks(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

async function errorFrom(error: unknown, fallback: string): Promise<string> {
  // A non-2xx (a daily cap) carries its message in the body; invoke() only says "non-2xx".
  try {
    const body = await (error as { context?: Response }).context?.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // not JSON: fall through
  }
  return fallback;
}

export type GenerateWrittenInput = {
  studyText?: string;
  /** Pages read on the phone (materialForNotes). */
  source?: { text: string; images: { page: number; data: string }[] };
  /** A small PDF sent whole when the reader couldn't start. */
  syllabusFile?: PdfFileInput;
  kinds: WrittenKind[];
  questionCount: number;
};

export async function generateWritten(
  input: GenerateWrittenInput
): Promise<{ quiz: WrittenQuiz; error: null } | { quiz: null; error: string }> {
  const { data, error } = await supabase.functions.invoke<{ extracted?: WrittenQuiz; error?: string }>('written-quiz', {
    body: { action: 'generate', ...input },
  });
  if (error) return { quiz: null, error: await errorFrom(error, 'Could not reach the AI right now.') };
  if (!data || data.error || !data.extracted) {
    return { quiz: null, error: data?.error ?? 'Something went wrong writing those questions.' };
  }
  return { quiz: data.extracted, error: null };
}

/** Marks one answer: typed text, or a photo of the page (JPEG base64). */
export async function markWritten(
  question: WrittenQuestion,
  answer: { text?: string; imageBase64?: string }
): Promise<{ marked: MarkedAnswer; error: null } | { marked: null; error: string }> {
  const { data, error } = await supabase.functions.invoke<{ marked?: MarkedAnswer; error?: string }>('written-quiz', {
    body: { action: 'mark', question, answerText: answer.text, answerImage: answer.imageBase64 },
  });
  if (error) return { marked: null, error: await errorFrom(error, 'Could not reach the AI right now.') };
  if (!data || data.error || !data.marked) {
    return { marked: null, error: data?.error ?? 'Something went wrong marking that answer.' };
  }
  return { marked: data.marked, error: null };
}

export async function commitWritten(quiz: WrittenQuiz): Promise<{ quizId: string | null; error: string | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { quizId: null, error: 'Not authenticated.' };
    const { data, error } = await supabase
      .from('written_quizzes')
      .insert({ owner_id: user.id, title: quiz.title, questions: quiz.questions, total_marks: totalMarks(quiz) })
      .select('id')
      .single();
    if (error) throw error;
    return { quizId: data.id as string, error: null };
  } catch (err) {
    return { quizId: null, error: err instanceof Error ? err.message : 'Could not save this quiz.' };
  }
}

export async function fetchWrittenQuizzes(userId: string): Promise<WrittenSummary[]> {
  const { data, error } = await supabase
    .from('written_quizzes')
    .select('id, title, questions, total_marks, best_marks')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    questionCount: Array.isArray(r.questions) ? r.questions.length : 0,
    totalMarks: r.total_marks as number,
    bestMarks: r.best_marks === null ? null : Number(r.best_marks),
  }));
}

export async function fetchWrittenQuiz(id: string): Promise<WrittenQuiz> {
  const { data, error } = await supabase.from('written_quizzes').select('title, questions').eq('id', id).single();
  if (error) throw error;
  return { title: data.title as string, questions: data.questions as WrittenQuestion[] };
}

export async function deleteWritten(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('written_quizzes').delete().eq('id', id);
  return { error: error ? error.message : null };
}

/** Keeps the best attempt; RLS limits this to the owner's own rows. */
export async function recordWrittenBest(id: string, marks: number): Promise<void> {
  const { data } = await supabase.from('written_quizzes').select('best_marks').eq('id', id).single();
  if (data && data.best_marks !== null && Number(data.best_marks) >= marks) return;
  await supabase.from('written_quizzes').update({ best_marks: marks }).eq('id', id);
}

/**
 * "Practise what I missed": a short text of the ideas that lost marks,
 * used as the material for a fresh set of questions on just those.
 */
export function missedMaterial(
  quiz: WrittenQuiz,
  results: (MarkedAnswer | null)[]
): { text: string; kinds: WrittenKind[]; count: number } {
  const lines: string[] = [];
  const kinds = new Set<WrittenKind>();
  let missed = 0;
  quiz.questions.forEach((q, i) => {
    const r = results[i];
    const lost = r ? r.points.filter((p) => p.got < p.marks) : q.scheme;
    if (lost.length === 0) return;
    missed += 1;
    kinds.add(q.kind);
    lines.push(`Topic: ${q.prompt}`);
    for (const p of lost) lines.push(`- ${p.point}`);
    if (q.modelAnswer) lines.push(`Reference: ${q.modelAnswer}`);
  });
  return { text: lines.join('\n'), kinds: [...kinds], count: Math.min(8, Math.max(3, missed)) };
}

import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { PdfFileInput } from '../utils/pdfPicker';
import { ReadFigure, ReadPage, ReadScan } from '../utils/pdfReader/reader';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** A figure shown above a question: a data URI while fresh, a signed link once saved. */
export type QuestionImage = {
  uri: string;
  /** JPEG base64, kept until the quiz is saved so the picture can be uploaded. */
  base64?: string;
  width?: number;
  height?: number;
};

export type ExtractedQuestion = {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  /** A picture question's figure (migration 0028). */
  image?: QuestionImage | null;
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
  /** Picture questions: the id of a figure sent in `source.figures`. */
  figure?: string | null;
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
  /** One part's share of a PDF read on the phone (see materialForParts). */
  source?: SourcePayload;
  difficulty: Difficulty;
  questionCount: number;
};

// ---------------------------------------------------------------------------
// Big PDFs (14 Nov): the phone reads the PDF and sends text, not the file
// ---------------------------------------------------------------------------

/** What the reader pulled out of the pages the student picked. */
export type StudyMaterial = {
  from: number;
  to: number;
  pages: ReadPage[];
  scans: ReadScan[];
  figures: ReadFigure[];
};

/** What one request carries (generate-quiz's SourceInput). */
export type SourcePayload = {
  text: string;
  images: { page: number; data: string }[];
  figures: { id: string; page: number; data: string; w?: number; h?: number }[];
  shared: boolean;
};

/** Per-request limits, a little under the Edge Functions' own. */
const PART_TEXT_LIMIT = 220_000;
const NOTES_TEXT_LIMIT = 300_000;
const IMAGES_PER_REQUEST = 8;
const FIGURES_PER_PART = 3;
/** Below this much text every part reads all of it (and covers its own section). */
const SHARED_TEXT_LIMIT = 30_000;
/** A scanned page counts as this much text when sharing pages out. */
const SCAN_WEIGHT = 2500;

function spreadPick<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list;
  return Array.from({ length: max }, (_, i) => list[Math.floor((i * list.length) / max)]);
}

/** "[Page 12]" + text for each page, dropping evenly spaced pages if it runs over `limit`. */
function pagesText(pages: ReadPage[], limit: number): string {
  let keep = pages;
  const size = (ps: ReadPage[]) => ps.reduce((n, p) => n + p.text.length + 14, 0);
  while (keep.length > 1 && size(keep) > limit) {
    keep = spreadPick(keep, Math.max(1, Math.floor(keep.length * (limit / size(keep)) * 0.95)));
  }
  return keep
    .map((p) => `[Page ${p.n}]\n${p.text}`)
    .join('\n\n')
    .slice(0, limit);
}

/**
 * Shares the material out over the quiz's parts. Short material goes whole
 * to every part (each then covers its own section, as with a PDF); longer
 * material is cut into runs of pages of about equal size, one per part, so
 * each request reads only its own pages. Figures go with their pages.
 */
export function materialForParts(m: StudyMaterial, partCount: number): SourcePayload[] {
  type Unit = { page: number; weight: number; text?: ReadPage; scan?: ReadScan };
  const units: Unit[] = [
    ...m.pages.map((p) => ({ page: p.n, weight: p.text.length, text: p })),
    ...m.scans.map((s) => ({ page: s.page, weight: SCAN_WEIGHT, scan: s })),
  ].sort((a, b) => a.page - b.page);
  const total = units.reduce((n, u) => n + u.weight, 0);
  const figures = m.figures.map((f) => ({ id: f.id, page: f.page, data: f.data, w: f.w, h: f.h }));

  const shared =
    partCount === 1 ||
    units.length < partCount ||
    (total <= SHARED_TEXT_LIMIT && m.scans.length <= IMAGES_PER_REQUEST);
  if (shared) {
    const text = pagesText(m.pages, PART_TEXT_LIMIT);
    const images = spreadPick(m.scans, IMAGES_PER_REQUEST).map((s) => ({ page: s.page, data: s.data }));
    return Array.from({ length: partCount }, (_, i) => ({
      text,
      images,
      figures: figures.filter((_, k) => k % partCount === i).slice(0, FIGURES_PER_PART),
      shared: partCount > 1,
    }));
  }

  // Cut where the running total crosses each part's share.
  const groups: Unit[][] = Array.from({ length: partCount }, () => []);
  let before = 0;
  for (const u of units) {
    const middle = before + u.weight / 2;
    groups[Math.min(partCount - 1, Math.floor((middle / Math.max(1, total)) * partCount))].push(u);
    before += u.weight;
  }
  // A part left empty (one huge page next to it) reads its nearest neighbour's pages.
  for (let i = 0; i < partCount; i++) {
    if (groups[i].length > 0) continue;
    for (let d = 1; d < partCount; d++) {
      const g = groups[i - d]?.length ? groups[i - d] : groups[i + d]?.length ? groups[i + d] : null;
      if (g) {
        groups[i] = g;
        break;
      }
    }
  }
  return groups.map((g) => {
    const first = g[0].page;
    const last = g[g.length - 1].page;
    return {
      text: pagesText(g.flatMap((u) => (u.text ? [u.text] : [])), PART_TEXT_LIMIT),
      images: spreadPick(g.flatMap((u) => (u.scan ? [{ page: u.scan.page, data: u.scan.data }] : [])), IMAGES_PER_REQUEST),
      figures: spreadPick(figures.filter((f) => f.page >= first && f.page <= last), FIGURES_PER_PART),
      shared: false,
    };
  });
}

/** The whole picked range for the pointer cards: all the text that fits, and some scanned pages. */
export function materialForNotes(m: StudyMaterial): { text: string; images: { page: number; data: string }[] } {
  return {
    text: pagesText(m.pages, NOTES_TEXT_LIMIT),
    images: spreadPick(m.scans, IMAGES_PER_REQUEST).map((s) => ({ page: s.page, data: s.data })),
  };
}

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

  // A figure question gets its picture from the figures this request sent.
  const figures = new Map((input.source?.figures ?? []).map((f) => [f.id, f]));
  const questions = data.extracted.questions.map((q): ExtractedQuestion => {
    const figure = q.figure ? figures.get(q.figure) : undefined;
    return {
      prompt: q.prompt,
      choices: [q.choiceA, q.choiceB, q.choiceC, q.choiceD],
      correctIndex: LETTERS.indexOf(q.correctChoice),
      explanation: q.explanation,
      image: figure
        ? { uri: `data:image/jpeg;base64,${figure.data}`, base64: figure.data, width: figure.w, height: figure.h }
        : null,
    };
  });

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
  input: Pick<GenerateQuizInput, 'studyText' | 'syllabusFile' | 'fileToken'> & {
    /** A PDF read on the phone (materialForNotes). */
    source?: { text: string; images: { page: number; data: string }[] };
  }
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

    // Picture questions: each figure is saved as <quiz id>/<position>.jpg.
    // A picture that fails to upload (twice) leaves that question without it.
    const imagePaths = await Promise.all(
      quiz.questions.map(async (q, i) => {
        if (!q.image?.base64) return null;
        const path = `${quizRow.id}/${i + 1}.jpg`;
        for (let attempt = 0; attempt < 2; attempt++) {
          const { error } = await supabase.storage
            .from(FIGURE_BUCKET)
            .upload(path, decode(q.image.base64), { contentType: 'image/jpeg', upsert: true });
          if (!error) return path;
        }
        return null;
      })
    );

    const rows = quiz.questions.map((q, i) => ({
      quiz_id: quizRow.id,
      prompt: q.prompt,
      choices: q.choices,
      correct_index: q.correctIndex,
      explanation: q.explanation,
      position: i + 1,
      image_path: imagePaths[i],
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
  // Figures first: the storage policy needs the quiz row to still exist.
  try {
    const { data: files } = await supabase.storage.from(FIGURE_BUCKET).list(quizId, { limit: 100 });
    if (files?.length) await supabase.storage.from(FIGURE_BUCKET).remove(files.map((f) => `${quizId}/${f.name}`));
  } catch {
    // a leftover picture is harmless; the quiz still goes
  }
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
    .select('prompt, choices, correct_index, explanation, image_path')
    .eq('quiz_id', quizId)
    .order('position', { ascending: true });
  if (error) throw error;

  // Private pictures: short-lived links, made in one call for the whole quiz.
  const paths = (data ?? []).map((row) => row.image_path as string | null).filter((p): p is string => !!p);
  const links = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(FIGURE_BUCKET).createSignedUrls(paths, 6 * 60 * 60);
    for (const s of signed ?? []) if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
  }

  return (data ?? []).map((row) => {
    const link = row.image_path ? links.get(row.image_path as string) : undefined;
    return {
      prompt: row.prompt as string,
      choices: row.choices as string[],
      correctIndex: row.correct_index as number,
      explanation: row.explanation as string,
      image: link ? { uri: link } : null,
    };
  });
}

const FIGURE_BUCKET = 'quiz-figures';

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

// Works in any script (a Hindi quiz is all non-Latin letters): only spaces
// and punctuation are folded, so two different Hindi prompts never collapse
// into the same empty key. No \p{L} here, to be safe on every JS engine.
const norm = (t: string) =>
  t
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s.,;:!?'"“”‘’()[\]{}\-–—_/\\|।]+/g, ' ')
    .trim();

/**
 * Writes the quiz as parallel parts of ~5 questions, each covering its own
 * section of the material. `onProgress` fires as each part lands with the
 * questions so far (repeats across parts dropped), so the quiz can start on
 * the first one. Resolves with the whole quiz once every part settles.
 */
export async function generateQuizParts(
  input: GenerateQuizInput,
  onProgress: (quiz: ExtractedQuiz, settled: number, parts: number) => void,
  /** Pages read on the phone, shared out over the parts (in place of the PDF). */
  studyMaterial?: StudyMaterial
): Promise<GenerateResult> {
  const partCount = Math.max(1, Math.ceil(input.questionCount / QUESTIONS_PER_PART));
  const sizes = splitEvenly(input.questionCount, partCount);
  const batchId = newBatchId();
  const { syllabusFile, fileToken, ...rest } = input;
  const material = fileToken ? { fileToken } : { syllabusFile };
  // A PDF read on the phone: each part gets its own pages instead of the file.
  const sources = studyMaterial ? materialForParts(studyMaterial, partCount) : null;

  let title = '';
  const questions: ExtractedQuestion[] = [];
  const seen = new Set<string>();
  let settled = 0;
  let firstError: string | null = null;

  await Promise.all(
    sizes.map(async (size, i) => {
      const result = await generateQuiz({
        ...rest,
        ...(sources ? { source: sources[i] } : material),
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

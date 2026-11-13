import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Personal deadlines (migration 0023): things a student has to hand in that
 * are not group-project tasks. Caught from a pasted message, a photo, or
 * typed, through the parse-deadline Edge Function, then reviewed and saved.
 *
 * A deadline is a calendar DAY plus an optional local TIME (never a
 * timestamptz): "due Friday" stays "due Friday" in the student's own
 * timezone, with no invented 11:59 PM.
 */

export type DeadlineKind = 'assignment' | 'test' | 'viva' | 'lab' | 'presentation' | 'other';
export type DeadlineSource = 'typed' | 'pasted' | 'photo' | 'shared';

export const KIND_LABEL: Record<DeadlineKind, string> = {
  assignment: 'Assignment',
  test: 'Test',
  viva: 'Viva',
  lab: 'Lab',
  presentation: 'Presentation',
  other: 'Other',
};
export const KINDS = Object.keys(KIND_LABEL) as DeadlineKind[];

/** What parse-deadline found; also the shape the review screen edits. */
export type DraftDeadline = {
  key: string;
  title: string;
  course: string | null;
  kind: DeadlineKind;
  /** YYYY-MM-DD; null until the student picks a day. */
  dueOn: string | null;
  /** HH:MM 24-hour, local. */
  dueTime: string | null;
  details: string | null;
  /** The words the date came from ("kal 5 baje"). */
  quote: string | null;
};

export type Deadline = {
  id: string;
  title: string;
  course: string | null;
  kind: DeadlineKind;
  dueOn: string;
  dueTime: string | null;
  details: string | null;
  doneAt: string | null;
};

// ---------------------------------------------------------------------------
// Dates (pure, local calendar days)
// ---------------------------------------------------------------------------

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysYmd(s: string, n: number): string {
  const d = fromYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** Whole days from today to `dueOn` (negative = late). */
export function daysUntil(dueOn: string, today: Date = new Date()): number {
  const a = fromYmd(ymd(today)).getTime();
  const b = fromYmd(dueOn).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "5 PM", "10:30 AM". */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Today", "Tomorrow", "Mon", or "Mon 16 Nov" further out. */
export function formatDay(dueOn: string, today: Date = new Date(), long = false): string {
  const n = daysUntil(dueOn, today);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  const d = fromYmd(dueOn);
  if (!long && n > 1 && n < 7) return WEEK[d.getDay()];
  return `${WEEK[d.getDay()]} ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

/** "Tomorrow · 5 PM" / "Mon 16 Nov · 10 AM" (board PReviewDeadlines). */
export function formatDue(dueOn: string | null, dueTime: string | null, today: Date = new Date()): string {
  if (!dueOn) return 'Pick a day';
  const day = formatDay(dueOn, today, true);
  return dueTime ? `${day} · ${formatClock(dueTime)}` : day;
}

/** Plain words for the "“kal 5 baje” = tomorrow, 5 PM" line. */
export function explainDue(dueOn: string, dueTime: string | null, today: Date = new Date()): string {
  const day = formatDay(dueOn, today, true);
  const lower = day === 'Today' || day === 'Tomorrow' || day === 'Yesterday' ? day.toLowerCase() : day;
  return dueTime ? `${lower}, ${formatClock(dueTime)}` : lower;
}

// A course keeps one colour everywhere: picked from its name, no table.
const COURSE_DOTS = ['#4F7BE8', '#C75FA8', '#20A875', '#E9A321', '#6C4CE8', '#E95B57', '#2BA3B5'];
export function courseColor(course: string | null): string {
  if (!course) return '#9D99A6';
  let h = 0;
  for (const ch of course.trim().toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COURSE_DOTS[h % COURSE_DOTS.length];
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

// ---------------------------------------------------------------------------
// Server calls
// ---------------------------------------------------------------------------

let draftSeq = 0;
export function newDraftKey(): string {
  draftSeq += 1;
  return `d${Date.now()}-${draftSeq}`;
}

export function blankDraft(): DraftDeadline {
  return { key: newDraftKey(), title: '', course: null, kind: 'assignment', dueOn: null, dueTime: null, details: null, quote: null };
}

/** dev/PreviewGate swaps the network call for fixtures; unused in real builds. */
export const deadlineDevOverrides: { parse?: typeof parseDeadlines } = {};

export async function parseDeadlines(input: {
  text?: string;
  image?: { base64: string; mimeType?: string };
}): Promise<{ deadlines: DraftDeadline[] | null; error: string | null }> {
  if (deadlineDevOverrides.parse) return deadlineDevOverrides.parse(input);
  const { data, error } = await supabase.functions.invoke<{
    deadlines?: Omit<DraftDeadline, 'key'>[];
    error?: string;
  }>('parse-deadline', { body: { ...input, timezone: deviceTimezone() } });
  if (error) return { deadlines: null, error: 'Could not reach GroupMate. Check your internet and try again.' };
  if (!data || data.error) return { deadlines: null, error: data?.error ?? 'Could not read that. Try again.' };
  return { deadlines: (data.deadlines ?? []).map((d) => ({ ...d, key: newDraftKey() })), error: null };
}

type Row = {
  id: string;
  title: string;
  course: string | null;
  kind: DeadlineKind;
  due_on: string;
  due_time: string | null;
  details: string | null;
  deadline_completions: { done_at: string }[] | null;
};

function fromRow(r: Row): Deadline {
  return {
    id: r.id,
    title: r.title,
    course: r.course,
    kind: r.kind,
    dueOn: r.due_on,
    // Postgres time comes back as HH:MM:SS.
    dueTime: r.due_time ? r.due_time.slice(0, 5) : null,
    details: r.details,
    doneAt: r.deadline_completions?.[0]?.done_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type DeadlinesState = {
  deadlines: Deadline[];
  loading: boolean;
  /** Saves the reviewed drafts. Drafts without a day or title are refused by the caller first. */
  save: (drafts: DraftDeadline[], source: DeadlineSource, sourceText: string | null) => Promise<{ error: string | null }>;
  setDone: (id: string, done: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
};

export const DeadlinesContext = createContext<DeadlinesState | null>(null);

/** How far back late items are still shown (anything older is history). */
const LOOKBACK_DAYS = 14;

export function DeadlinesProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const since = addDaysYmd(ymd(new Date()), -LOOKBACK_DAYS);
    const { data, error } = await supabase
      .from('deadlines')
      .select('id, title, course, kind, due_on, due_time, details, deadline_completions(done_at)')
      .eq('owner_id', userId)
      .gte('due_on', since)
      .order('due_on', { ascending: true })
      .order('due_time', { ascending: true, nullsFirst: false });
    if (!error && data) setDeadlines((data as unknown as Row[]).map(fromRow));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    reload();
    // The morning summary picks people by their local hour, so the server
    // needs the phone's real zone. Cheap, and only when it differs.
    const tz = deviceTimezone();
    supabase
      .from('profiles')
      .update({ timezone: tz })
      .eq('id', userId)
      .neq('timezone', tz)
      .then(() => {});
  }, [reload, userId]);

  const save = useCallback<DeadlinesState['save']>(
    async (drafts, source, sourceText) => {
      const rows = drafts
        .filter((d) => d.title.trim() && d.dueOn)
        .map((d) => ({
          owner_id: userId,
          title: d.title.trim().slice(0, 200),
          course: d.course?.trim() ? d.course.trim().slice(0, 80) : null,
          kind: d.kind,
          due_on: d.dueOn,
          due_time: d.dueTime,
          details: d.details?.trim() ? d.details.trim().slice(0, 1000) : null,
          source,
          source_text: sourceText ? sourceText.slice(0, 4000) : null,
        }));
      if (rows.length === 0) return { error: null };
      const { error } = await supabase.from('deadlines').insert(rows);
      if (error) return { error: 'Could not save. Check your internet and try again.' };
      await reload();
      return { error: null };
    },
    [userId, reload]
  );

  const setDone = useCallback(
    async (id: string, done: boolean) => {
      // Optimistic: the tick should feel instant.
      setDeadlines((all) => all.map((d) => (d.id === id ? { ...d, doneAt: done ? new Date().toISOString() : null } : d)));
      const { error } = done
        ? await supabase.from('deadline_completions').insert({ deadline_id: id, user_id: userId })
        : await supabase.from('deadline_completions').delete().eq('deadline_id', id).eq('user_id', userId);
      if (error) await reload();
    },
    [userId, reload]
  );

  const remove = useCallback(
    async (id: string) => {
      setDeadlines((all) => all.filter((d) => d.id !== id));
      const { error } = await supabase.from('deadlines').delete().eq('id', id);
      if (error) await reload();
    },
    [reload]
  );

  const value = useMemo(
    () => ({ deadlines, loading, save, setDone, remove, reload }),
    [deadlines, loading, save, setDone, remove, reload]
  );
  return <DeadlinesContext.Provider value={value}>{children}</DeadlinesContext.Provider>;
}

export function useDeadlines(): DeadlinesState {
  const ctx = useContext(DeadlinesContext);
  if (!ctx) throw new Error('useDeadlines() must be called within a DeadlinesProvider');
  return ctx;
}

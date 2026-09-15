import { supabase } from '../lib/supabase';
import { Priority } from '../data/tasks';
import { PdfFileInput } from '../utils/pdfPicker';

export type ExtractedTask = {
  title: string;
  sectionRef: string;
  priority: Priority;
  requirementLabels: string[];
  metadata: string | null;
  /** What this specific person should actually write or produce — see parse-brief's prompt. */
  guidance: string;
  /** Bullet-point structural skeleton to write from — short topic labels, never finished sentences. */
  outline: string[];
  /** AI-estimated hours of work, from the task's actual scope. */
  effortHours: number;
  /** 0-based indices into this SAME tasks array — other tasks that must finish first. Resolved to real ids in commitExtractedProject. */
  dependsOnIndexes: number[];
};

export type ExtractedProjectData = {
  projectName: string;
  course: string;
  dueDate: string;
  requirements: { label: string }[];
  tasks: ExtractedTask[];
};

export type ParseBriefInput = {
  /** Typed/pasted text. Alongside a file it's treated as additional notes, not a replacement. */
  briefText?: string;
  briefFile?: PdfFileInput;
  /** Optional — used only for general constraints/context (citation style, policies), never as a source of requirements. */
  syllabusFile?: PdfFileInput;
};

type ParseBriefResult = { extracted: ExtractedProjectData; error: null } | { extracted: null; error: string };

/**
 * Calls the parse-brief Edge Function — extraction only, nothing is
 * persisted yet. The caller shows this for review; commitExtractedProject
 * below is the step that actually writes it.
 */
export async function parseBrief(input: ParseBriefInput): Promise<ParseBriefResult> {
  const { data, error } = await supabase.functions.invoke<{ extracted?: ExtractedProjectData; error?: string }>(
    'parse-brief',
    { body: input }
  );

  if (error) {
    return { extracted: null, error: error.message ?? 'Could not reach the AI right now.' };
  }
  if (!data || data.error || !data.extracted) {
    return { extracted: null, error: data?.error ?? 'Something went wrong reading that brief.' };
  }
  return { extracted: data.extracted, error: null };
}

/**
 * Persists a reviewed, user-confirmed extraction as this user's one
 * project — replacing whatever they had before. Runs client-side (not in
 * the Edge Function) through the same owner-scoped RLS policies as every
 * other write in the app; there's no privileged step here.
 */
export async function commitExtractedProject(extracted: ExtractedProjectData): Promise<{ error: string | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated.' };

    const { error: deleteError } = await supabase.from('projects').delete().eq('owner_id', user.id);
    if (deleteError) throw deleteError;

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        owner_id: user.id,
        name: extracted.projectName,
        team: 'Team 4',
        course: extracted.course,
        due_date: extracted.dueDate,
      })
      .select('id')
      .single();
    if (projectError) throw projectError;

    // Every read in this app (fetchProjectData) looks the project up
    // through project_members, not projects.owner_id — without this row
    // the creator can't see the project they just made.
    const { error: memberError } = await supabase
      .from('project_members')
      .insert({ project_id: project.id, user_id: user.id, role: 'owner' });
    if (memberError) throw memberError;

    const requirementIdByLabel = new Map<string, string>();
    for (const [i, requirement] of extracted.requirements.entries()) {
      const { data: row, error } = await supabase
        .from('requirements')
        .insert({ project_id: project.id, label: requirement.label, position: i + 1 })
        .select('id')
        .single();
      if (error) throw error;
      requirementIdByLabel.set(requirement.label, row.id);
    }

    const taskIdByIndex: string[] = [];
    for (const [i, task] of extracted.tasks.entries()) {
      const { data: taskRow, error } = await supabase
        .from('tasks')
        .insert({
          project_id: project.id,
          title: task.title,
          section_ref: task.sectionRef,
          // AI-generated tasks land unclaimed — teammates claim them (see
          // migration 0010's Member model).
          assignee_id: null,
          priority: task.priority,
          metadata: task.metadata,
          guidance: task.guidance,
          outline: task.outline,
          effort_hours: task.effortHours,
          position: i + 1,
        })
        .select('id')
        .single();
      if (error) throw error;
      taskIdByIndex[i] = taskRow.id;

      const links = task.requirementLabels
        .map((label) => requirementIdByLabel.get(label))
        .filter((id): id is string => Boolean(id))
        .map((requirementId) => ({ task_id: taskRow.id, requirement_id: requirementId }));
      if (links.length > 0) {
        const { error: linkError } = await supabase.from('task_requirements').insert(links);
        if (linkError) throw linkError;
      }
    }

    // A second pass: dependsOnIndexes only makes sense once every task has a
    // real id, so dependency rows are resolved and inserted after the loop
    // above rather than inline with it (mirrors requirementIdByLabel).
    const dependencyRows = extracted.tasks.flatMap((task, i) =>
      task.dependsOnIndexes
        .filter((depIndex) => depIndex !== i && depIndex >= 0 && depIndex < taskIdByIndex.length)
        .map((depIndex) => ({ task_id: taskIdByIndex[i], depends_on_task_id: taskIdByIndex[depIndex] }))
    );
    if (dependencyRows.length > 0) {
      const { error: dependencyError } = await supabase.from('task_dependencies').insert(dependencyRows);
      if (dependencyError) throw dependencyError;
    }

    return { error: null };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Could not save this project.' };
  }
}

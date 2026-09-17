import { supabase } from '../lib/supabase';
import { saveActiveProjectId } from './activeProject';
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

/** A PDF has no mimeType (the Edge Function assumes application/pdf); a camera photo sets it so the Edge Function sends input_image instead of input_file. */
export type BriefAttachment = { filename: string; base64: string; mimeType?: string };

export type ParseBriefInput = {
  /** Typed/pasted text. Alongside a file it's treated as additional notes, not a replacement. */
  briefText?: string;
  briefFile?: BriefAttachment;
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
 * Persists a reviewed, user-confirmed extraction as a new project, and
 * makes it the active one. Runs client-side (not in the Edge Function)
 * through the same membership-scoped RLS policies as every other write in
 * the app; there's no privileged step here.
 *
 * This used to delete every project the caller owned before inserting,
 * which is what made one-project-per-user true — project_members has
 * always had a composite (project_id, user_id) key and could hold as many
 * as you like. Creating is now purely additive: the delete would destroy a
 * project you were still working on and, because it cascades, everything
 * your teammates had in it too.
 */
export async function commitExtractedProject(extracted: ExtractedProjectData): Promise<{ error: string | null }> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: 'Not authenticated.' };

    // One RPC, not an insert into projects followed by one into
    // project_members. Done as two client writes, RLS made each depend on
    // the other having happened first: reading the new project back needs a
    // membership, and adding the membership needs to see the project. Every
    // create from the app failed with 42501 — see migration 0019.
    const { data: projectId, error: projectError } = await supabase.rpc('create_project', {
      project_name: extracted.projectName,
      project_team: 'Team 4',
      project_course: extracted.course,
      project_due_date: extracted.dueDate,
    });
    if (projectError) throw projectError;
    const project = { id: projectId as string };

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

    // Land in the project you just made rather than whichever one sorts
    // first. Written here rather than by the calling screen because
    // onboarding creates projects from outside any ProjectProvider.
    await saveActiveProjectId(user.id, project.id);

    return { error: null };
  } catch (err) {
    // Supabase's errors are plain objects with a message, not Error
    // instances — an instanceof check discarded every one of them, which is
    // why the RLS failure above only ever surfaced as the fallback text.
    const message = (err as { message?: unknown } | null)?.message;
    return { error: typeof message === 'string' && message ? message : 'Could not save this project.' };
  }
}

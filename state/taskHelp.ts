import { supabase } from '../lib/supabase';

export type TaskHelp = { guidance: string; outline: string[] };

export type GenerateTaskHelpInput = {
  projectName: string;
  course: string;
  taskTitle: string;
  sectionRef: string;
  requirementLabels: string[];
  metadata: string | null;
  effortHours: number | null;
};

/**
 * Calls the generate-task-help Edge Function — generation only, nothing is
 * persisted here. Split out of parse-brief so a task's guidance/outline is
 * written only the first time someone actually taps "Help" on it, not for
 * every task in a freshly parsed brief whether or not anyone ever opens it.
 * ProjectRepository.generateTaskHelp is what persists the result and caches
 * it on the task so this never runs twice.
 */
export async function generateTaskHelp(input: GenerateTaskHelpInput): Promise<{ help: TaskHelp | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke<{ help?: TaskHelp; error?: string }>('generate-task-help', {
    body: input,
  });

  if (error) {
    return { help: null, error: error.message ?? 'Could not reach the AI right now.' };
  }
  if (!data || data.error || !data.help) {
    return { help: null, error: data?.error ?? 'Something went wrong writing that help.' };
  }
  return { help: data.help, error: null };
}

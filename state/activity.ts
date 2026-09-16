import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { Member } from '../data/member';

export type ActivityKind = 'join' | 'message' | 'task';

export type ActivityItem = {
  /** Stable across refetches, so the list doesn't reshuffle keys. */
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  detail: string;
  /** Who it concerns, when that's a person — drives the avatar. */
  member?: Member;
};

function storageKey(projectId: string, userId: string) {
  return `groupmate:activitySeen:${projectId}:${userId}`;
}

/** When this device last opened the activity list. Null means never. */
export async function loadLastSeen(projectId: string, userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(storageKey(projectId, userId));
  } catch {
    return null;
  }
}

export async function markActivitySeen(projectId: string, userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(projectId, userId), new Date().toISOString());
  } catch {
    // A lost stamp only means the dot shows once more than it needed to.
  }
}

const LIMIT = 15;

/**
 * What happened in this project while you weren't looking.
 *
 * Assembled from rows that already exist rather than from a notifications
 * table: project_members.joined_at, tasks.created_at and messages.created_at
 * are the three things that actually happen in a project, and they are
 * already written on every relevant action. A dedicated table would need
 * every write path to remember to fan out into it, and would drift the
 * first time one forgot.
 *
 * The limitation that buys: this can only report events the schema already
 * timestamps. A task being *claimed* has no timestamp of its own (tasks
 * carry created_at and completed_at, not an assignment history), so it
 * cannot appear here yet without a column to hang it on.
 */
export async function fetchActivity(
  projectId: string,
  currentUserId: string,
  membersById: Record<string, Member>
): Promise<ActivityItem[]> {
  const [{ data: joinRows, error: joinError }, { data: taskRows, error: taskError }] = await Promise.all([
    supabase
      .from('project_members')
      .select('user_id, joined_at')
      .eq('project_id', projectId)
      .order('joined_at', { ascending: false })
      .limit(LIMIT),
    supabase
      .from('tasks')
      .select('id, title, assignee_id, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
  ]);
  if (joinError) throw joinError;
  if (taskError) throw taskError;

  const items: ActivityItem[] = [];

  for (const row of (joinRows ?? []) as { user_id: string; joined_at: string }[]) {
    // Your own membership row is the moment you created or joined the
    // project — true, but not news to you.
    if (row.user_id === currentUserId) continue;
    const member = membersById[row.user_id];
    items.push({
      id: 'join:' + row.user_id,
      kind: 'join',
      at: row.joined_at,
      title: `${member ? member.name.split(' ')[0] : 'Someone'} joined the project`,
      detail: 'They can see the plan and claim tasks',
      member,
    });
  }

  for (const row of (taskRows ?? []) as {
    id: string;
    title: string;
    assignee_id: string | null;
    created_at: string;
  }[]) {
    const mine = row.assignee_id === currentUserId;
    items.push({
      id: 'task:' + row.id,
      kind: 'task',
      at: row.created_at,
      title: mine ? `New task for you: ${row.title}` : `New task: ${row.title}`,
      detail: mine
        ? 'Assigned to you'
        : row.assignee_id
          ? `Assigned to ${membersById[row.assignee_id]?.name.split(' ')[0] ?? 'a teammate'}`
          : 'Unclaimed — anyone can take it',
      member: row.assignee_id ? membersById[row.assignee_id] : undefined,
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, LIMIT);
}

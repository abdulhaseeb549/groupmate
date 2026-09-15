/**
 * A real project member — one row from project_members joined against their
 * own profiles row. Replaces the old data/team.ts fixed 4-person TeamId
 * union now that teammates are real auth.users accounts: `id` is a real
 * uuid (auth.users.id), not a closed set of literal strings, so there's no
 * TEAM_ORDER-style constant to import — the member list is always fetched
 * per-project via ProjectRepository (see state/projectQueries.ts).
 */
export type Member = {
  id: string;
  initials: string;
  name: string;
  bg: string;
  fg: string;
  role: 'owner' | 'member';
};

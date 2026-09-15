import { TeamId } from './team';

export type Project = {
  id: string;
  name: string;
  team: string;
  course: string;
  /** YYYY-MM-DD, read as a local calendar date. */
  dueDate: string;
  /** Hours each teammate can spend on this project per day — the other input the schedule needs alongside task effort. Defaults to 2 for everyone until someone edits it. */
  memberHoursPerDay: Record<TeamId, number>;
};

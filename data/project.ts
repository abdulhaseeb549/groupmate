export type Project = {
  id: string;
  name: string;
  team: string;
  course: string;
  /** YYYY-MM-DD, read as a local calendar date. */
  dueDate: string;
  /** Hours each teammate can spend on this project per day, keyed by member id — the other input the schedule needs alongside task effort. Defaults to 2 for everyone until someone edits it. */
  memberHoursPerDay: Record<string, number>;
  /** Shareable code a new signup can enter to join this project as a member instead of getting their own seeded demo project. */
  inviteCode: string;
};

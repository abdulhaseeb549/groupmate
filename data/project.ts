export type Project = {
  id: string;
  name: string;
  team: string;
  course: string;
  /** YYYY-MM-DD, read as a local calendar date. */
  dueDate: string;
};

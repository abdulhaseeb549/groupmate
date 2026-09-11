/**
 * Many-to-many join: a task can serve more than one requirement, and a
 * requirement is satisfied only once every task linked to it is done.
 */
export type TaskRequirement = {
  taskId: string;
  requirementId: string;
};

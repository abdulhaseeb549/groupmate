/**
 * A task can depend on more than one other task — "what's actually blocking
 * this" is a join over this table, not a stored status, same reasoning as
 * requirement status in state/projectState.ts. Phase 1 of the Timeline/
 * scheduling-engine work: this is the raw graph a backward-scheduling
 * algorithm needs, but nothing computes dates from it yet.
 */
export type TaskDependency = {
  taskId: string;
  dependsOnTaskId: string;
};

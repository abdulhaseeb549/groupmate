import { TeamId } from './team';

export type Priority = 'high' | 'medium' | 'low';

export type TaskStatus = 'not_started' | 'in_progress' | 'completed';

export type Task = {
  id: string;
  title: string;
  sectionRef: string;
  assigneeId: TeamId;
  status: TaskStatus;
  /** Set only when status is 'completed' — cleared if the task is reopened. */
  completedAt?: string;
  priority: Priority;
  /** Only set where the narrative calls for a visible deadline chip. */
  dueLabel?: string;
  dueUrgent?: boolean;
  /** Only set where there's something concrete to show (word count, sources found, etc). */
  metadata?: string;
  /** Concrete direction for the assignee: what to cover, how it ties to the requirements, what to leave for others. */
  guidance?: string;
  /** Bullet-point structural skeleton to write from — short topic labels, never finished sentences. */
  outline?: string[];
  /** AI-estimated hours of work, from word/slide/scope signals in the brief. Undefined where never estimated — never fabricated. */
  effortHours?: number;
};

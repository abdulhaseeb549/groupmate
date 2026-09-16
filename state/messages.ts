import { supabase } from '../lib/supabase';

export type Message = {
  id: string;
  projectId: string;
  authorId: string;
  /** Plain-text message. Null for a shared-task card or a file attachment. */
  body: string | null;
  /** Set when this message shares a task rather than carrying text. Can go null later if the task is deleted — the message stays as chat history, just stops pointing at anything. */
  sharedTaskId: string | null;
  /** Null for the group conversation; a specific member's id for a direct message addressed to them. */
  recipientId: string | null;
  /** A private Storage object path (not a URL) — resolve with getAttachmentUrl before rendering/opening. Null unless this message carries a file. */
  attachmentPath: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentSize: number | null;
  createdAt: string;
};

type MessageRow = {
  id: string;
  project_id: string;
  author_id: string;
  body: string | null;
  shared_task_id: string | null;
  recipient_id: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  created_at: string;
};

/** Which thread a message belongs to — the one project-wide group chat, or a 1:1 with one other member. */
export type Conversation = { type: 'group' } | { type: 'dm'; otherUserId: string };

const SELECT_COLUMNS =
  'id, project_id, author_id, body, shared_task_id, recipient_id, attachment_path, attachment_name, attachment_type, attachment_size, created_at';

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    projectId: row.project_id,
    authorId: row.author_id,
    body: row.body,
    sharedTaskId: row.shared_task_id,
    recipientId: row.recipient_id,
    attachmentPath: row.attachment_path,
    attachmentName: row.attachment_name,
    attachmentType: row.attachment_type,
    attachmentSize: row.attachment_size,
    createdAt: row.created_at,
  };
}

/** True if a message (from anywhere in the project) belongs to the given conversation as currently viewed by currentUserId. */
export function belongsToConversation(message: Message, currentUserId: string, conversation: Conversation): boolean {
  if (conversation.type === 'group') return message.recipientId === null;
  const { otherUserId } = conversation;
  return (
    (message.authorId === currentUserId && message.recipientId === otherUserId) ||
    (message.authorId === otherUserId && message.recipientId === currentUserId)
  );
}

export async function fetchMessages(
  projectId: string,
  currentUserId: string,
  conversation: Conversation
): Promise<Message[]> {
  let query = supabase.from('messages').select(SELECT_COLUMNS).eq('project_id', projectId);
  query =
    conversation.type === 'group'
      ? query.is('recipient_id', null)
      : query.or(
          `and(author_id.eq.${currentUserId},recipient_id.eq.${conversation.otherUserId}),` +
            `and(author_id.eq.${conversation.otherUserId},recipient_id.eq.${currentUserId})`
        );
  const { data, error } = await query.order('created_at');
  if (error) throw error;
  return (data ?? []).map(toMessage);
}

export async function sendMessage(
  projectId: string,
  authorId: string,
  body: string,
  recipientId: string | null = null
): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({ project_id: projectId, author_id: authorId, body, recipient_id: recipientId });
  if (error) throw error;
}

/** Shares a task into the group conversation — task-claim cards are always broadcast to the whole team, not sent as a DM. */
export async function shareTask(projectId: string, authorId: string, taskId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({ project_id: projectId, author_id: authorId, shared_task_id: taskId });
  if (error) throw error;
}

/**
 * Uploads file bytes to the private chat-attachments bucket, then inserts
 * the message row pointing at it. Two steps, not a transaction — if the
 * insert fails after a successful upload, the object is orphaned in
 * Storage (harmless, just unreferenced; no cleanup job exists for this
 * v1, matching this app's general no-offline-queue risk tolerance
 * elsewhere).
 */
export async function sendAttachment(
  projectId: string,
  authorId: string,
  file: { filename: string; mimeType: string; size: number; bytes: ArrayBuffer },
  recipientId: string | null = null
): Promise<void> {
  const path = `${projectId}/${authorId}-${Date.now()}-${file.filename}`;
  const { error: uploadError } = await supabase.storage
    .from('chat-attachments')
    .upload(path, file.bytes, { contentType: file.mimeType });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('messages').insert({
    project_id: projectId,
    author_id: authorId,
    recipient_id: recipientId,
    attachment_path: path,
    attachment_name: file.filename,
    attachment_type: file.mimeType,
    attachment_size: file.size,
  });
  if (error) throw error;
}

/** A short-lived signed URL for a private attachment — resolved fresh each time it's opened, never stored. */
export async function getAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('chat-attachments').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Live new-message push for one project — every conversation's messages
 * flow through the same channel, filtered by RLS to only what this user
 * is allowed to see (group messages, or a DM they're a participant in).
 * The caller filters further, down to the one conversation it's showing,
 * via belongsToConversation. Only INSERT is handled — v1 has no edit/
 * delete on messages, so that's the only event that can occur. Returns an
 * unsubscribe function.
 */
export function subscribeToMessages(
  projectId: string,
  onInsert: (message: Message) => void,
  /** True once the channel is actually live, false if it drops or errors. The chat header's dot reflects this instead of assuming a connection. */
  onLive?: (live: boolean) => void
): () => void {
  const channel = supabase
    .channel(`project:${projectId}:messages`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
      (payload) => onInsert(toMessage(payload.new as MessageRow))
    )
    .subscribe((status) => onLive?.(status === 'SUBSCRIBED'));
  return () => {
    void supabase.removeChannel(channel);
  };
}

export type Reaction = { messageId: string; userId: string; emoji: string };

type ReactionRow = { message_id: string; user_id: string; emoji: string };

function toReaction(row: ReactionRow): Reaction {
  return { messageId: row.message_id, userId: row.user_id, emoji: row.emoji };
}

export async function fetchReactions(messageIds: string[]): Promise<Reaction[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji')
    .in('message_id', messageIds);
  if (error) throw error;
  return (data ?? []).map(toReaction);
}

export async function addReaction(
  messageId: string,
  projectId: string,
  userId: string,
  emoji: string
): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .insert({ message_id: messageId, project_id: projectId, user_id: userId, emoji });
  if (error) throw error;
}

export async function removeReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji);
  if (error) throw error;
}

export type ReactionEvent = { type: 'insert' | 'delete'; reaction: Reaction };

/** Live reaction add/remove push for one project, filtered client-side (via the messageId on each event) to whichever conversation's messages are loaded. */
export function subscribeToReactions(projectId: string, onChange: (event: ReactionEvent) => void): () => void {
  const channel = supabase
    .channel(`project:${projectId}:reactions`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: `project_id=eq.${projectId}` },
      (payload) => onChange({ type: 'insert', reaction: toReaction(payload.new as ReactionRow) })
    )
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'message_reactions', filter: `project_id=eq.${projectId}` },
      (payload) => onChange({ type: 'delete', reaction: toReaction(payload.old as ReactionRow) })
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

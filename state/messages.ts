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
 * Unsends a message — a real delete, not a "deleted message" placeholder
 * row. RLS (migration 0020) scopes this to the caller's own messages, so
 * there's nothing to check client-side beyond only ever showing the action
 * on your own bubbles. message_reactions cascade-deletes with its parent
 * message (0014); an attachment's Storage object is left behind, same
 * accepted tradeoff as a failed upload leaving one orphaned (see
 * sendAttachment above) — no cleanup job exists for either in v1.
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase.from('messages').delete().eq('id', messageId);
  if (error) throw error;
}

/**
 * Live new-message (and unsend) push for one project — every
 * conversation's messages flow through the same channel, filtered by RLS
 * to only what this user is allowed to see (group messages, or a DM
 * they're a participant in). The caller filters further, down to the one
 * conversation it's showing, via belongsToConversation. Returns an
 * unsubscribe function.
 */
export function subscribeToMessages(
  projectId: string,
  onInsert: (message: Message) => void,
  /** True once the channel is actually live, false if it drops or errors. The chat header's dot reflects this instead of assuming a connection. */
  onLive?: (live: boolean) => void,
  /** Realtime topics are unique per socket, so two components watching the same project at once (the open thread and the unread tracker) must not ask for the same one. */
  subscriberId: string = "default",
  /**
   * Fired when a message is unsent. Optional — the unread tracker only
   * cares about the newest message per thread and accepts a stale preview
   * until its next cold-start refetch if that exact message gets unsent,
   * same class of tradeoff this file already makes elsewhere.
   */
  onDelete?: (messageId: string) => void
): () => void {
  const channel = supabase
    .channel(`project:${projectId}:messages:${subscriberId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
      (payload) => onInsert(toMessage(payload.new as MessageRow))
    )
    .on(
      // Requires messages' replica identity to be FULL (migration 0020) —
      // otherwise a DELETE's payload.old carries only the primary key, and
      // this project_id filter would never match anything.
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` },
      (payload) => onDelete?.((payload.old as MessageRow).id)
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

/** Stable identity for a conversation — the storage key for its read state and the lookup key for its summary. */
export function conversationKey(conversation: Conversation): string {
  return conversation.type === 'group' ? 'group' : `dm:${conversation.otherUserId}`;
}

export type ConversationSummary = {
  key: string;
  conversation: Conversation;
  /** One line for the chat-list row — the message text, or what it was if it carried no text. */
  preview: string;
  lastAt: string;
  lastAuthorId: string;
};

// One scan covers every conversation in a student project's chat many
// times over; paginating would buy nothing but a second round trip.
const SUMMARY_SCAN_LIMIT = 300;

/** What a message reduces to in a list row when it isn't plain text. */
export function messagePreview(message: Message): string {
  if (message.body) return message.body;
  if (message.attachmentName) return message.attachmentName;
  if (message.sharedTaskId) return 'Shared a task';
  return 'Message';
}

/** Which conversation a message belongs to, from the reader's point of view. */
export function conversationOf(message: Message, currentUserId: string): Conversation {
  if (message.recipientId === null) return { type: 'group' };
  return {
    type: 'dm',
    otherUserId: message.authorId === currentUserId ? message.recipientId : message.authorId,
  };
}

/**
 * Last activity per conversation in a single query, keyed by
 * conversationKey. RLS (0013) already narrows the rows to the group chat
 * plus DMs this user is a participant in, so no per-conversation query is
 * needed — the reduce below just keeps the newest row per thread.
 *
 * This is what lets the chat list show a real preview and an unread dot
 * instead of a static "Direct message" label on every row.
 */
export async function fetchConversationSummaries(
  projectId: string,
  currentUserId: string
): Promise<Record<string, ConversationSummary>> {
  const { data, error } = await supabase
    .from('messages')
    .select(SELECT_COLUMNS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(SUMMARY_SCAN_LIMIT);
  if (error) throw error;

  const summaries: Record<string, ConversationSummary> = {};
  for (const row of data ?? []) {
    const message = toMessage(row as MessageRow);
    const conversation = conversationOf(message, currentUserId);
    const key = conversationKey(conversation);
    // Newest-first, so the first row seen for a thread is its latest.
    if (summaries[key]) continue;
    summaries[key] = {
      key,
      conversation,
      preview: messagePreview(message),
      lastAt: message.createdAt,
      lastAuthorId: message.authorId,
    };
  }
  return summaries;
}

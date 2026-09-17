import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

const LAST_TOKEN_KEY = 'groupmate:pushToken';

/** Passed as `channelId` in every push sent via send-push — see the comment in configureNotificationHandler below. */
export const MESSAGE_CHANNEL_ID = 'messages';

let handlerConfigured = false;

/** Foreground banner + sound, and an Android notification channel. Called once from PushNotificationRegistrar; safe to call more than once. */
export function configureNotificationHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    // A new channel id, not 'default': Android treats a channel's
    // vibration/sound settings as fixed once created, so a device that
    // already ran an earlier build (which created 'default' with no
    // vibrationPattern) would keep silently vibrating never, no matter
    // what this code changes, unless the id itself changes. send-push
    // must pass this same id as channelId, or Expo falls back to
    // 'default' and this has no effect.
    void Notifications.setNotificationChannelAsync(MESSAGE_CHANNEL_ID, {
      name: 'Messages & tasks',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      sound: 'default',
    });
  }
}

/**
 * Requests permission and returns an Expo push token — or null if the
 * device declined, or if there's no EAS project id configured yet (Phase 0
 * of the push-notifications plan: a Firebase + Expo project have to exist
 * first). Never throws: a missing or not-yet-finished push setup must
 * never be the thing that breaks sign-in.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let status = existingStatus;
    if (status !== 'granted') {
      const { status: requestedStatus } = await Notifications.requestPermissionsAsync();
      status = requestedStatus;
    }
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    if (!projectId) return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch {
    return null;
  }
}

/** Persists this device's token via the register_push_token RPC (migration 0021) — never a raw table write, so a client can never register a token as a user it isn't. */
export async function savePushToken(token: string): Promise<void> {
  const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
  if (error) throw error;
  await AsyncStorage.setItem(LAST_TOKEN_KEY, token).catch(() => {});
}

/** Called on sign-out — the token this device registered this session, so a shared/reused device stops getting this account's pushes once signed out. */
export async function removeLastPushToken(): Promise<void> {
  const token = await AsyncStorage.getItem(LAST_TOKEN_KEY).catch(() => null);
  if (!token) return;
  try {
    await supabase.rpc('unregister_push_token', { p_token: token });
  } catch {
    // Best-effort — sign-out must never hang or fail because of this.
  }
  await AsyncStorage.removeItem(LAST_TOKEN_KEY).catch(() => {});
}

/**
 * Fire-and-forget, same reasoning as the send-push Edge Function itself
 * never returning a fatal error: a push failing must never surface as an
 * error on the message/task action that triggered it. The caller already
 * has everything needed to write the notification itself (its own display
 * name, the text it just sent) — send-push is a thin relay, not a second
 * copy of message-preview logic, so the text is assembled here, not
 * server-side. Called once per recipient — a group thread loops this at
 * the call site (ChatScreen).
 */
export function notifyMessage(
  recipientId: string,
  senderName: string,
  preview: string,
  projectId: string,
  /** Set only for a DM — the sender's id, so the recipient's tap opens a DM with them rather than the group. Omitted for a group message. */
  dmSenderId?: string
): void {
  void supabase.functions.invoke('send-push', {
    body: {
      targetUserId: recipientId,
      title: senderName,
      body: preview,
      data: { kind: 'message', projectId, conversationOtherUserId: dmSenderId ?? null },
    },
  });
}

/** Fire-and-forget — see notifyMessage. Only call this when the new assignee isn't the person making the change; they already know. */
export function notifyTaskAssigned(assigneeId: string, taskTitle: string, projectName: string, projectId: string, taskId: string): void {
  void supabase.functions.invoke('send-push', {
    body: {
      targetUserId: assigneeId,
      title: 'New task assigned',
      body: `${taskTitle} · ${projectName}`,
      data: { kind: 'task_assigned', projectId, taskId },
    },
  });
}

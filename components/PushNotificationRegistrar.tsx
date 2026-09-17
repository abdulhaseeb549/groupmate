import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '../state/NavigationProvider';
import { configureNotificationHandler, registerForPushNotificationsAsync, savePushToken } from '../state/pushNotifications';
import { useProject } from '../state/ProjectRepository';

type NotificationData = {
  kind?: 'message' | 'task_assigned';
  projectId?: string;
  conversationOtherUserId?: string | null;
};

/**
 * Renders nothing. Registers this device for push once signed in, and
 * routes a tapped notification to the right place — a message opens its
 * conversation through the same goToChat() "Share to chat" already uses;
 * a task push just switches to Projects, since there's no existing global
 * "open this exact task" primitive to hook into (see the push-
 * notifications plan for why that's an accepted v1 gap, not an oversight).
 */
export function PushNotificationRegistrar({ userId }: { userId: string }) {
  const { goToChat, setActiveTab } = useNavigation();
  const { project, switchProject } = useProject();

  useEffect(() => {
    configureNotificationHandler();
    let cancelled = false;
    registerForPushNotificationsAsync().then((token) => {
      if (!cancelled && token) void savePushToken(token);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as NotificationData;
      if (!data.projectId) return;
      // Only switch if it's actually a different project — switchProject
      // refetches everything, which would flash a loading screen for the
      // common case of a push arriving for the project already open.
      if (data.projectId !== project.id) switchProject(data.projectId);

      if (data.kind === 'message') {
        goToChat(data.conversationOtherUserId ? { type: 'dm', otherUserId: data.conversationOtherUserId } : { type: 'group' });
      } else if (data.kind === 'task_assigned') {
        setActiveTab('projects');
      }
    });
    return () => subscription.remove();
  }, [project.id, switchProject, goToChat, setActiveTab]);

  return null;
}

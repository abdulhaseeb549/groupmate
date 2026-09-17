import { useEffect, useState } from 'react';
import { NavTab } from '../components/BottomNav';
import { useNavigation } from '../state/NavigationProvider';
import { Conversation } from '../state/messages';
import { useChatUnread } from '../state/chatUnread';
import { useHardwareBackHandler } from '../utils/hardwareBack';
import { ChatListScreen } from './ChatListScreen';
import { ChatScreen } from './ChatScreen';

type Props = {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
};

/**
 * The Chat tab is two screens sharing one piece of state — which
 * conversation (if any) is open. Null shows the pick list (with the
 * normal bottom nav, like any other tab); picking a conversation swaps in
 * the full-screen message view instead (no bottom nav — see ChatScreen).
 */
export function ChatTab({ activeTab, onSelectTab }: Props) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const { requestedConversation, clearChatOpenRequest } = useNavigation();
  const { markRead } = useChatUnread();

  // "Share to chat" (TaskDetailModal) and the joined-toast tap both set
  // this to land straight in a conversation, same one-shot pattern as
  // goToNewQuiz/StudyScreen.
  useEffect(() => {
    if (requestedConversation) {
      markRead(requestedConversation);
      setConversation(requestedConversation);
      clearChatOpenRequest();
    }
  }, [requestedConversation, clearChatOpenRequest, markRead]);

  // Stamped on open and again on close: opening clears the dot, and the
  // second stamp covers anything that arrived while the thread was on
  // screen and already read.
  function openConversation(next: Conversation) {
    markRead(next);
    setConversation(next);
  }

  function closeConversation() {
    if (conversation) markRead(conversation);
    setConversation(null);
  }

  useHardwareBackHandler(closeConversation, conversation !== null);

  if (conversation) {
    return <ChatScreen conversation={conversation} onBack={closeConversation} />;
  }

  return (
    <ChatListScreen activeTab={activeTab} onSelectTab={onSelectTab} onOpenConversation={openConversation} />
  );
}

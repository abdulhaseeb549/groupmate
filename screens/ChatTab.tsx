import { useEffect, useState } from 'react';
import { NavTab } from '../components/BottomNav';
import { useNavigation } from '../state/NavigationProvider';
import { Conversation } from '../state/messages';
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
  const { chatOpenRequested, clearChatOpenRequest } = useNavigation();

  // "Share to chat" (TaskDetailModal) sets this flag to land straight in
  // the group conversation, same one-shot pattern as goToNewQuiz/StudyScreen.
  useEffect(() => {
    if (chatOpenRequested) {
      setConversation({ type: 'group' });
      clearChatOpenRequest();
    }
  }, [chatOpenRequested, clearChatOpenRequest]);

  if (conversation) {
    return <ChatScreen conversation={conversation} onBack={() => setConversation(null)} />;
  }

  return (
    <ChatListScreen activeTab={activeTab} onSelectTab={onSelectTab} onOpenConversation={setConversation} />
  );
}

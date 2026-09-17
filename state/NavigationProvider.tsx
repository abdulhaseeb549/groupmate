import { createContext, ReactNode, useContext, useState } from 'react';
import { NavTab } from '../components/BottomNav';
import { Conversation } from './messages';

type NavigationState = {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  newProjectOpen: boolean;
  openNewProject: () => void;
  closeNewProject: () => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  /** Set by the "+" menu's Study shortcut — StudyScreen reads this once on
   *  mount to jump straight into the new-quiz setup instead of the quiz
   *  list, then clears it. */
  studySetupRequested: boolean;
  goToNewQuiz: () => void;
  clearStudySetupRequest: () => void;
  /** Set by "Share to chat" (TaskDetailModal) and by the joined-toast tap —
   *  ChatTab reads this to land straight in a conversation instead of the
   *  chat list, then clears it. Same one-shot shape as studySetupRequested,
   *  but carrying which conversation rather than a bare boolean: a task
   *  share always means the group, while a teammate who just joined means
   *  the 1:1 with them. */
  requestedConversation: Conversation | null;
  goToChat: (conversation?: Conversation) => void;
  clearChatOpenRequest: () => void;
};

const NavigationContext = createContext<NavigationState | null>(null);

/**
 * App-wide UI state that doesn't belong to any one screen — which tab is
 * active, whether the New Project flow is open, and cross-tab shortcuts
 * like "+" → Study. Exists so CreateMenu (nested inside BottomNav, inside
 * every tab screen) can act on any of these without every screen in
 * between having to thread callbacks through its props.
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [studySetupRequested, setStudySetupRequested] = useState(false);
  const [requestedConversation, setRequestedConversation] = useState<Conversation | null>(null);

  function goToNewQuiz() {
    setActiveTab('study');
    setStudySetupRequested(true);
  }

  function goToChat(conversation: Conversation = { type: 'group' }) {
    setActiveTab('chat');
    setRequestedConversation(conversation);
  }

  return (
    <NavigationContext.Provider
      value={{
        activeTab,
        setActiveTab,
        newProjectOpen,
        openNewProject: () => setNewProjectOpen(true),
        closeNewProject: () => setNewProjectOpen(false),
        settingsOpen,
        openSettings: () => setSettingsOpen(true),
        closeSettings: () => setSettingsOpen(false),
        studySetupRequested,
        goToNewQuiz,
        clearStudySetupRequest: () => setStudySetupRequested(false),
        requestedConversation,
        goToChat,
        clearChatOpenRequest: () => setRequestedConversation(null),
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationState {
  const ctx = useContext(NavigationContext);
  if (!ctx) {
    throw new Error('useNavigation() must be called within a NavigationProvider');
  }
  return ctx;
}

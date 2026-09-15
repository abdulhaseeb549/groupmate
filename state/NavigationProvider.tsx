import { createContext, ReactNode, useContext, useState } from 'react';
import { NavTab } from '../components/BottomNav';

type NavigationState = {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  newProjectOpen: boolean;
  openNewProject: () => void;
  closeNewProject: () => void;
  /** Set by the "+" menu's Study shortcut — StudyScreen reads this once on
   *  mount to jump straight into the new-quiz setup instead of the quiz
   *  list, then clears it. */
  studySetupRequested: boolean;
  goToNewQuiz: () => void;
  clearStudySetupRequest: () => void;
  /** Set by "Share to chat" (TaskDetailModal) — ChatTab reads this to jump
   *  straight into the group conversation instead of the chat list, then
   *  clears it. Same one-shot-flag shape as studySetupRequested. */
  chatOpenRequested: boolean;
  goToChat: () => void;
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
  const [studySetupRequested, setStudySetupRequested] = useState(false);
  const [chatOpenRequested, setChatOpenRequested] = useState(false);

  function goToNewQuiz() {
    setActiveTab('study');
    setStudySetupRequested(true);
  }

  function goToChat() {
    setActiveTab('chat');
    setChatOpenRequested(true);
  }

  return (
    <NavigationContext.Provider
      value={{
        activeTab,
        setActiveTab,
        newProjectOpen,
        openNewProject: () => setNewProjectOpen(true),
        closeNewProject: () => setNewProjectOpen(false),
        studySetupRequested,
        goToNewQuiz,
        clearStudySetupRequest: () => setStudySetupRequested(false),
        chatOpenRequested,
        goToChat,
        clearChatOpenRequest: () => setChatOpenRequested(false),
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

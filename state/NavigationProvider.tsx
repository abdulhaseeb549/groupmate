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

  function goToNewQuiz() {
    setActiveTab('study');
    setStudySetupRequested(true);
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

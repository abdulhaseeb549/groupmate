import AsyncStorage from '@react-native-async-storage/async-storage';

function storageKey(userId: string) {
  return `groupmate:activeProject:${userId}`;
}

/**
 * Which of your projects the app opens into.
 *
 * Kept here rather than inside ProjectRepository because it has to be
 * writable from outside the provider: commitExtractedProject creates a
 * project from the onboarding screen, which renders *before* any
 * ProjectContext exists, and the project it just made should be the one
 * you land in.
 *
 * Per-device by design — which project you were last looking at on your
 * phone is not a fact about the project, and syncing it would mean a
 * column and a write on every switch.
 */
export async function loadActiveProjectId(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(storageKey(userId));
  } catch {
    // An unreadable store just means "no preference" — the caller falls
    // back to the earliest project, which is always a valid choice.
    return null;
  }
}

export async function saveActiveProjectId(userId: string, projectId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(userId), projectId);
  } catch {
    // Losing the preference is survivable; failing the switch is not.
  }
}

export const ONBOARDING_STORAGE_KEY = "musart.onboarding.v1";
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

/** Completion belongs to this browser, never to a portable project. */
export function hasCompletedOnboarding(storage: () => PreferenceStorage = () => localStorage) {
  try {
    const raw = storage().getItem(ONBOARDING_STORAGE_KEY);
    if (!raw || raw.length > 128) return false;
    const value: unknown = JSON.parse(raw);
    return Boolean(
      value &&
      typeof value === "object" &&
      "version" in value &&
      value.version === 1 &&
      "completed" in value &&
      value.completed === true,
    );
  } catch {
    return false;
  }
}

export function completeOnboarding(storage: () => PreferenceStorage = () => localStorage) {
  try {
    storage().setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ version: 1, completed: true }));
    return true;
  } catch {
    return false;
  }
}

export type ProfileSettings = {
  name?: string;
  avatarUrl?: string;
};

const STORAGE_KEY = "profileSettings";

export function loadProfileSettings(): ProfileSettings {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ProfileSettings;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProfileSettings(next: ProfileSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures (quota, privacy mode).
  }
}

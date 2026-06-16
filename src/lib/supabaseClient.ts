import { createClient } from "@supabase/supabase-js";
import { getErrorMessage } from "@/lib/errorUtils";
import type { User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REMEMBER_LOGIN_KEY = "guimfinancial-remember-login";
const NETWORK_WARNING_DEDUP_MS = 15_000;
const recentNetworkWarnings = new Map<string, number>();

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
}

if (!supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
}

const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

function removeStoredSession(storageKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
  window.localStorage.removeItem(`${storageKey}-user`);
  window.localStorage.removeItem(`${storageKey}-code-verifier`);
}

function parseSessionExpiryMs(rawSession: string): number | null {
  try {
    const parsed = JSON.parse(rawSession) as
      | {
          expires_at?: unknown;
          expiresAt?: unknown;
          currentSession?: { expires_at?: unknown };
          session?: { expires_at?: unknown };
        }
      | null;
    if (!parsed || typeof parsed !== "object") return null;

    const candidates = [
      parsed.expires_at,
      parsed.expiresAt,
      parsed.currentSession?.expires_at,
      parsed.session?.expires_at,
    ];
    for (const candidate of candidates) {
      const numeric = Number(candidate);
      if (!Number.isFinite(numeric)) continue;
      // Supabase expirations are usually seconds since epoch; guard both units.
      return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
    }
    return null;
  } catch {
    return null;
  }
}

export function getStoredSessionUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(authStorageKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as
      | {
          currentSession?: { user?: User | null };
          session?: { user?: User | null };
          user?: User | null;
        }
      | null;

    if (!parsed || typeof parsed !== "object") return null;
    return parsed.currentSession?.user ?? parsed.session?.user ?? parsed.user ?? null;
  } catch {
    return null;
  }
}

export function getRememberLoginPreference() {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(REMEMBER_LOGIN_KEY);
  if (stored === null) return true;
  return stored === "true";
}

export function setRememberLoginPreference(remember: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_LOGIN_KEY, remember ? "true" : "false");
}

const safeFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    const message = getErrorMessage(error);
    const requestUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    let host = "unknown-host";
    try {
      host = new URL(requestUrl).host;
    } catch {
      // ignore malformed URL extraction
    }
    const connectivityState =
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "offline"
        : "online_or_unknown";
    const detailedMessage = `Cannot reach ${host}: ${message}`;
    const warningKey = `${host}:${message}:${connectivityState}`;
    const now = Date.now();
    const lastWarnedAt = recentNetworkWarnings.get(warningKey) ?? 0;
    if (now - lastWarnedAt >= NETWORK_WARNING_DEDUP_MS) {
      // Keep this visible in dev tools without triggering Next's error overlay.
      console.warn(
        "[supabase] network request failed:",
        `${detailedMessage} (${connectivityState})`,
      );
      recentNetworkWarnings.set(warningKey, now);
    }
    return new Response(
      JSON.stringify({
        error: "network_error",
        message: detailedMessage,
      }),
      {
        // Use a non-retryable status so auth-js returns the JSON message instead of "{}".
        status: 500,
        statusText: "Network Error",
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
};

function clearExpiredStoredSession(storageKey: string) {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return;
  const expiresAtMs = parseSessionExpiryMs(raw);
  if (expiresAtMs === null) return;
  if (expiresAtMs <= Date.now()) {
    removeStoredSession(storageKey);
  }
}

if (getRememberLoginPreference()) {
  clearExpiredStoredSession(authStorageKey);
} else {
  removeStoredSession(authStorageKey);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: safeFetch,
  },
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: authStorageKey,
  },
});

import { createClient } from "@supabase/supabase-js";
import { processLock } from "@supabase/auth-js";
import { getErrorMessage } from "@/lib/errorUtils";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
}

if (!supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
}

const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

function isTauriRuntime() {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  const hasTauriGlobals = Boolean(w.__TAURI__ || w.__TAURI_INTERNALS__);
  const hasTauriUserAgent =
    typeof navigator !== "undefined" && /tauri/i.test(navigator.userAgent);
  return hasTauriGlobals || hasTauriUserAgent;
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
    const detailedMessage = `Cannot reach ${host}: ${message}`;
    // Keep this visible in dev tools without triggering Next's error overlay.
    console.warn("[supabase] network request failed:", detailedMessage);
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
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { expires_at?: unknown } | null;
    const expiresAt =
      parsed && typeof parsed === "object" ? Number(parsed.expires_at) : Number.NaN;
    if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) {
      window.localStorage.removeItem(storageKey);
      window.localStorage.removeItem(`${storageKey}-user`);
      window.localStorage.removeItem(`${storageKey}-code-verifier`);
    }
  } catch {
    // ignore malformed storage payloads
  }
}

if (isTauriRuntime()) {
  clearExpiredStoredSession(authStorageKey);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: safeFetch,
  },
  auth: {
    autoRefreshToken: !isTauriRuntime(),
    detectSessionInUrl: false,
    storageKey: authStorageKey,
    lock: isTauriRuntime() ? (name, _acquireTimeout, fn) => processLock(name, -1, fn) : undefined,
  },
});

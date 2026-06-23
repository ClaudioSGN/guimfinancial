import { createClient } from "@supabase/supabase-js";
import { getErrorMessage, isOversizedHeaderError } from "@/lib/errorUtils";
import type { User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REMEMBER_LOGIN_KEY = "guimfinancial-remember-login";
const FORCE_LOGOUT_KEY = "guimfinancial-force-logout";
const NETWORK_WARNING_DEDUP_MS = 15_000;
const recentNetworkWarnings = new Map<string, number>();
const SUPABASE_REST_PROXY_HEADER_ALLOWLIST = new Set([
  "accept",
  "accept-profile",
  "apikey",
  "authorization",
  "content-profile",
  "content-type",
  "prefer",
  "range",
  "range-unit",
  "x-client-info",
  "x-supabase-api-version",
]);

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
}

if (!supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
}

const supabaseHost = new URL(supabaseUrl).host;
const authStorageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;

function removeStoredSession(storageKey: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
  window.localStorage.removeItem(`${storageKey}-user`);
  window.localStorage.removeItem(`${storageKey}-code-verifier`);
}

export function clearStoredSupabaseSession() {
  removeStoredSession(authStorageKey);
}

export function setForcedLogoutFlag() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(FORCE_LOGOUT_KEY, "true");
}

export function clearForcedLogoutFlag() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(FORCE_LOGOUT_KEY);
}

export function hasForcedLogoutFlag() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(FORCE_LOGOUT_KEY) === "true";
}

export async function forceLogoutToLogin() {
  if (typeof window === "undefined") return;
  setForcedLogoutFlag();
  clearStoredSupabaseSession();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // ignore local sign-out cleanup failures
  }
  window.location.replace("/login");
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

function getRequestUrl(input: Parameters<typeof fetch>[0]) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

function buildRestProxyUrl(input: Parameters<typeof fetch>[0]) {
  if (typeof window === "undefined") return null;

  try {
    const requestUrl = new URL(getRequestUrl(input));
    if (requestUrl.host !== supabaseHost || !requestUrl.pathname.startsWith("/rest/v1/")) {
      return null;
    }

    return `${window.location.origin}/api/supabase-rest-proxy`;
  } catch {
    return null;
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index] ?? 0);
  }
  return btoa(binary);
}

async function buildRestProxyInit(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<RequestInit> {
  const upstreamHeaders = new Headers();
  const appendAllowedHeaders = (source?: HeadersInit) => {
    if (!source) return;
    new Headers(source).forEach((value, key) => {
      if (SUPABASE_REST_PROXY_HEADER_ALLOWLIST.has(key.toLowerCase())) {
        upstreamHeaders.set(key, value);
      }
    });
  };

  if (input instanceof Request) {
    appendAllowedHeaders(input.headers);
  }
  if (init?.headers) {
    appendAllowedHeaders(init.headers);
  }

  const method = init?.method ?? (input instanceof Request ? input.method : undefined);
  const normalizedMethod = (method ?? "GET").toUpperCase();
  const targetUrl = new URL(getRequestUrl(input));
  let bodyBase64: string | null = null;

  if (init?.body != null) {
    const requestBody =
      typeof init.body === "string"
        ? new TextEncoder().encode(init.body)
        : init.body instanceof URLSearchParams
          ? new TextEncoder().encode(init.body.toString())
          : init.body instanceof Blob
            ? new Uint8Array(await init.body.arrayBuffer())
            : init.body instanceof ArrayBuffer
              ? new Uint8Array(init.body)
              : ArrayBuffer.isView(init.body)
                ? new Uint8Array(init.body.buffer, init.body.byteOffset, init.body.byteLength)
                : null;
    bodyBase64 = requestBody ? toBase64(requestBody) : null;
  } else if (
    input instanceof Request &&
    normalizedMethod !== "GET" &&
    normalizedMethod !== "HEAD"
  ) {
    bodyBase64 = toBase64(new Uint8Array(await input.clone().arrayBuffer()));
  }

  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "omit",
    body: JSON.stringify({
      path: `${targetUrl.pathname}${targetUrl.search}`,
      method: normalizedMethod,
      headers: Object.fromEntries(upstreamHeaders.entries()),
      bodyBase64,
    }),
  };
}

const safeFetch: typeof fetch = async (input, init) => {
  try {
    const proxyUrl = buildRestProxyUrl(input);
    const response = proxyUrl
      ? await fetch(proxyUrl, await buildRestProxyInit(input, init))
      : await fetch(input, init);

    if (!response.ok) {
      const errorText = await response.clone().text().catch(() => "");
      if (isOversizedHeaderError(errorText)) {
        return new Response(
          JSON.stringify({
            error: "oversized_auth_header",
            message:
              "Supabase rejected the authenticated request because the session header is too large.",
          }),
          {
            status: 400,
            statusText: "Bad Request",
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }
    }

    return response;
  } catch (error) {
    const message = getErrorMessage(error);
    const requestUrl = getRequestUrl(input);
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

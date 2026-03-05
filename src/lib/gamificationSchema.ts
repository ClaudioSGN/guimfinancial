type ErrorWithCode = {
  code?: unknown;
  message?: unknown;
};

const STORAGE_KEY = "guimfinancial:gamification-schema-missing-at";
const MISSING_CACHE_MS = 15_000;

let schemaStatus: "unknown" | "available" | "missing" = "unknown";
let missingMarkedAt = 0;

if (typeof window !== "undefined") {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const storedAt = raw ? Number(raw) : 0;
    if (Number.isFinite(storedAt) && storedAt > 0) {
      schemaStatus = "missing";
      missingMarkedAt = storedAt;
    }
  } catch {
    // Ignore storage access errors.
  }
}

function asMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as ErrorWithCode).message;
    if (typeof message === "string") return message;
  }
  if (typeof error === "string") return error;
  return "";
}

export function isGamificationSchemaMissingError(error: unknown) {
  const message = asMessage(error).toLowerCase();
  const code = error && typeof error === "object" ? (error as ErrorWithCode).code : undefined;
  const codeText = typeof code === "string" ? code : "";

  if (codeText === "PGRST205" || codeText === "42P01") return true;
  if (message.includes("public.gamification_profiles") && message.includes("schema cache")) {
    return true;
  }
  if (message.includes("relation") && message.includes("gamification_profiles")) {
    return true;
  }
  return false;
}

export function markGamificationSchemaAvailable() {
  schemaStatus = "available";
  missingMarkedAt = 0;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage access errors.
    }
  }
}

export function markGamificationSchemaMissing() {
  schemaStatus = "missing";
  missingMarkedAt = Date.now();
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, String(missingMarkedAt));
    } catch {
      // Ignore storage access errors.
    }
  }
}

export function isGamificationSchemaMissingCached() {
  if (schemaStatus !== "missing") return false;
  if (!missingMarkedAt) return true;
  if (Date.now() - missingMarkedAt <= MISSING_CACHE_MS) return true;
  schemaStatus = "unknown";
  missingMarkedAt = 0;
  return false;
}

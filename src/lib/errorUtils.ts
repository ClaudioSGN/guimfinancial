type ErrorLike = {
  message?: unknown;
  details?: unknown;
};

const MISSING_COLUMN_PATTERNS = [
  /column ["']?(?:[a-zA-Z0-9_]+\.)*([a-zA-Z0-9_]+)["']? does not exist/i,
  /could not find (?:the )?["']?(?:[a-zA-Z0-9_]+\.)*([a-zA-Z0-9_]+)["']? column/i,
];

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const maybeMessage = (error as ErrorLike).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return String(error);
}

export function getMissingColumn(error: unknown): string | null {
  const candidates = [getErrorMessage(error)];

  if (error && typeof error === "object" && "details" in error) {
    const details = (error as ErrorLike).details;
    if (typeof details === "string") candidates.push(details);
  }

  for (const candidate of candidates) {
    for (const pattern of MISSING_COLUMN_PATTERNS) {
      const match = candidate.match(pattern);
      if (match?.[1]) return match[1];
    }
  }

  return null;
}

export function hasMissingColumnError(error: unknown, columns?: string[]): boolean {
  const missingColumn = getMissingColumn(error);
  if (!missingColumn) return false;
  if (!columns?.length) return true;
  return columns.includes(missingColumn);
}

export function hasMissingTableError(error: unknown, tables?: string[]): boolean {
  const candidates = [getErrorMessage(error)];

  if (error && typeof error === "object" && "details" in error) {
    const details = (error as ErrorLike).details;
    if (typeof details === "string") candidates.push(details);
  }

  const tablePatterns = [
    /relation ["']?(?:public\.)?([a-zA-Z0-9_]+)["']? does not exist/i,
    /could not find the table ["']?(?:public\.)?([a-zA-Z0-9_]+)["']?/i,
  ];

  for (const candidate of candidates) {
    for (const pattern of tablePatterns) {
      const match = candidate.match(pattern);
      if (!match?.[1]) continue;
      if (!tables?.length) return true;
      if (tables.includes(match[1])) return true;
    }
  }

  return false;
}

export function isTransientNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network request failed") ||
    message.includes("networkerror") ||
    message.includes("aborterror") ||
    message.includes("signal is aborted") ||
    message.includes("authretryablefetcherror")
  );
}

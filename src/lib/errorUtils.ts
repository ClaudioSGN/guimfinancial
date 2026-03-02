type ErrorLike = {
  message?: unknown;
};

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const maybeMessage = (error as ErrorLike).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return String(error);
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

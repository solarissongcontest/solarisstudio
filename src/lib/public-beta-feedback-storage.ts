type PublicBetaFeedbackStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): PublicBetaFeedbackStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function resolveStorage(
  storage: PublicBetaFeedbackStorage | null | undefined,
): PublicBetaFeedbackStorage | null {
  return storage === undefined ? browserStorage() : storage;
}

/**
 * Beta feedback must remain usable when browser storage is unavailable, blocked
 * or full. Local draft/marker state is a convenience only and must never become
 * submission authority or turn a successful server write into a reported
 * failure.
 */
export function readPublicBetaFeedbackStorage(
  key: string,
  storage?: PublicBetaFeedbackStorage | null,
): string | null {
  const target = resolveStorage(storage);
  if (!target) return null;
  try {
    return target.getItem(key);
  } catch {
    return null;
  }
}

export function writePublicBetaFeedbackStorage(
  key: string,
  value: string,
  storage?: PublicBetaFeedbackStorage | null,
): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    target.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removePublicBetaFeedbackStorage(
  key: string,
  storage?: PublicBetaFeedbackStorage | null,
): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;
  try {
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

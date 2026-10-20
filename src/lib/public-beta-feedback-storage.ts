type PublicBetaFeedbackStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * Beta feedback must remain usable when browser storage is unavailable, blocked
 * or full. Local draft/marker state is a convenience only and must never become
 * submission authority or turn a successful server write into a reported
 * failure.
 */
export function readPublicBetaFeedbackStorage(
  key: string,
  storage: PublicBetaFeedbackStorage = window.localStorage,
): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writePublicBetaFeedbackStorage(
  key: string,
  value: string,
  storage: PublicBetaFeedbackStorage = window.localStorage,
): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removePublicBetaFeedbackStorage(
  key: string,
  storage: PublicBetaFeedbackStorage = window.localStorage,
): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

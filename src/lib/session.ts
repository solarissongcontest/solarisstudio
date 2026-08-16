/** Browser-session identity + local draft cache for public submissions. */

const SESSION_KEY = "ssc.session_id";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Stable per-browser id. Returns "" during SSR. */
export function getBrowserSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id) {
      id = randomId();
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

const draftKey = (roundId: string) => `ssc.draft.${roundId}`;

export interface LocalDraft<T> {
  payload: T;
  step: number;
  savedAt: string;
}

export function readLocalDraft<T>(roundId: string): LocalDraft<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(roundId));
    return raw ? (JSON.parse(raw) as LocalDraft<T>) : null;
  } catch {
    return null;
  }
}

export function writeLocalDraft<T>(roundId: string, payload: T, step: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      draftKey(roundId),
      JSON.stringify({ payload, step, savedAt: new Date().toISOString() }),
    );
  } catch {
    /* storage full or blocked — server autosave still applies */
  }
}

export function clearLocalDraft(roundId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(roundId));
  } catch {
    /* ignore */
  }
}

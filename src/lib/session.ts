/** Browser-session identity + local draft cache for public submissions. */

import { captureGovernanceSnapshot } from "@/lib/governance-v5";
import {
  CONFIRMATION_SUBMITTED_EVENT,
  dispatchSubmissionReceipt,
  type SubmissionReceiptDetail,
} from "@/lib/submission-receipts";

const SESSION_KEY = "ssc.session_id";
export const CONFIRMATION_DRAFT_SAVED_EVENT = "solaris:confirmation-draft-saved";

export type ConfirmationDraftSavedDetail<T = unknown> = {
  roundId: string;
  payload: T;
  step: number;
  savedAt: string;
};

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
  const savedAt = new Date().toISOString();
  try {
    window.localStorage.setItem(
      draftKey(roundId),
      JSON.stringify({ payload, step, savedAt }),
    );
  } catch {
    /* storage full or blocked — server autosave still applies */
  }

  // Same-document storage events do not fire. Emit an explicit draft event so
  // the V3 country-account bridge can mirror the proven legacy form into the
  // authenticated cross-device draft authority without coupling either layer.
  window.dispatchEvent(
    new CustomEvent<ConfirmationDraftSavedDetail<T>>(CONFIRMATION_DRAFT_SAVED_EVENT, {
      detail: { roundId, payload, step, savedAt },
    }),
  );
}

export function clearLocalDraft(
  roundId: string,
  receipt?: Omit<SubmissionReceiptDetail, "id">,
) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(roundId));
  } catch {
    /* ignore */
  }

  // Clearing a draft and announcing an accepted official submission are
  // deliberately separate operations. Recovery code may clear a reconciled
  // draft after it already holds the authoritative receipt; emitting a second
  // empty receipt event there would regress the UI back to an unknown state.
  if (!receipt) return;

  // ConfirmationForm supplies receipt context only after an acknowledged
  // server result. Broadcasting that fact lets presentation UI resolve the
  // authoritative receipt without coupling the giant form to V3 state.
  dispatchSubmissionReceipt(CONFIRMATION_SUBMITTED_EVENT, roundId, {
    ...receipt,
    governance:
      receipt.governance ??
      (receipt.kind === "confirmation"
        ? captureGovernanceSnapshot("confirmation.submit")
        : null),
  });
}

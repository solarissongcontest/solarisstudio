import type { V3ConfirmationReceipt } from "@/lib/v3-confirmation.functions";

export type StoredV3ConfirmationReceipt = {
  version: 2;
  roundId: string;
  // This key is presentation/cache identity, never authorization authority.
  actorScope: string;
  submissionId: string;
  receipt: V3ConfirmationReceipt;
  storedAt: string;
};

// Keep the legacy key solely to remove pre-isolation receipts. Version-one
// records had no actor identity and must never be restored on a shared device.
const keyForRound = (roundId: string) => `ssc.v3.confirmation.receipt.${roundId}`;

export function confirmationReceiptActorScope(
  userId: string | null | undefined,
  browserSessionId: string,
): string | null {
  const browser = browserSessionId.trim();
  if (!browser) return null;
  const actor = userId?.trim();
  return actor ? `user:${actor}:session:${browser}` : `anonymous:session:${browser}`;
}

function valid(value: unknown, roundId: string, actorScope: string): value is StoredV3ConfirmationReceipt {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredV3ConfirmationReceipt>;
  return (
    candidate.version === 2 &&
    candidate.roundId === roundId &&
    candidate.actorScope === actorScope &&
    candidate.receipt?.authority === "authoritative_server" &&
    candidate.receipt.roundId === roundId &&
    typeof candidate.submissionId === "string" &&
    candidate.submissionId.length > 0 &&
    typeof candidate.storedAt === "string" &&
    Number.isFinite(Date.parse(candidate.storedAt))
  );
}

export function readStoredV3ConfirmationReceipt(
  roundId: string,
  actorScope: string | null,
): StoredV3ConfirmationReceipt | null {
  if (typeof window === "undefined") return null;
  const key = keyForRound(roundId);
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    // No identity, an obsolete record, malformed data, and an account switch
    // all invalidate the old local copy. Never reveal it before actor resolution.
    const parsed: unknown = JSON.parse(raw);
    if (!actorScope || !valid(parsed, roundId, actorScope)) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Local storage is best-effort; the server ledger remains authoritative.
    }
    return null;
  }
}

export function writeStoredV3ConfirmationReceipt(input: {
  roundId: string;
  actorScope: string | null;
  submissionId: string;
  receipt: V3ConfirmationReceipt;
}) {
  if (typeof window === "undefined") return;
  if (!input.actorScope) {
    clearStoredV3ConfirmationReceipt(input.roundId);
    return;
  }

  const stored: StoredV3ConfirmationReceipt = {
    version: 2,
    roundId: input.roundId,
    actorScope: input.actorScope,
    submissionId: input.submissionId,
    receipt: input.receipt,
    storedAt: new Date().toISOString(),
  };
  if (!valid(stored, input.roundId, input.actorScope)) return;
  try {
    window.localStorage.setItem(keyForRound(input.roundId), JSON.stringify(stored));
  } catch {
    // The authoritative server receipt still exists even if local persistence is blocked.
  }
}

export function clearStoredV3ConfirmationReceipt(roundId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyForRound(roundId));
  } catch {
    // Receipt authority is server-side; local cleanup is best-effort.
  }
}

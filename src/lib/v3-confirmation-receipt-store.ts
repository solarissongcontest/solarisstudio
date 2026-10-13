import type { V3ConfirmationReceipt } from "@/lib/v3-confirmation.functions";

export type StoredV3ConfirmationReceipt = {
  version: 1;
  roundId: string;
  submissionId: string;
  receipt: V3ConfirmationReceipt;
  storedAt: string;
};

const keyForRound = (roundId: string) => `ssc.v3.confirmation.receipt.${roundId}`;

function valid(value: StoredV3ConfirmationReceipt, roundId: string) {
  return (
    value.version === 1 &&
    value.roundId === roundId &&
    value.receipt?.authority === "authoritative_server" &&
    value.receipt.roundId === roundId &&
    typeof value.submissionId === "string" &&
    value.submissionId.length > 0 &&
    Number.isFinite(Date.parse(value.storedAt))
  );
}

export function readStoredV3ConfirmationReceipt(
  roundId: string,
): StoredV3ConfirmationReceipt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyForRound(roundId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredV3ConfirmationReceipt;
    return valid(parsed, roundId) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredV3ConfirmationReceipt(input: {
  roundId: string;
  submissionId: string;
  receipt: V3ConfirmationReceipt;
}) {
  if (typeof window === "undefined") return;
  const stored: StoredV3ConfirmationReceipt = {
    version: 1,
    roundId: input.roundId,
    submissionId: input.submissionId,
    receipt: input.receipt,
    storedAt: new Date().toISOString(),
  };
  if (!valid(stored, input.roundId)) return;
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
    // Best effort only.
  }
}

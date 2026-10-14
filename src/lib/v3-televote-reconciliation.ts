export type TelevoteAcceptedVote = {
  id: string;
  preflight_id: string;
  status: "active" | "suspicious" | "verified";
  accepted_at?: string | null;
  risk_score?: number;
};

export type TelevoteReceipt = TelevoteAcceptedVote & {
  found: true;
  round_id: string;
  accepted_at: string;
  authority: "authoritative_server";
};

export type TelevoteRecoveryReceipt = {
  found: true;
  id: string;
  round_id: string;
  status: "active" | "suspicious" | "verified";
  accepted_at: string;
  authority: "authoritative_server";
};

export type TelevoteRecoveryHandle = {
  operationId: string;
  recoverySecret: string;
};

function verifiedReceiptFields(value: unknown, roundId: string) {
  if (!value || typeof value !== "object") return null;
  const receipt = value as Partial<TelevoteRecoveryReceipt>;
  if (
    receipt.found !== true ||
    receipt.authority !== "authoritative_server" ||
    receipt.round_id !== roundId ||
    typeof receipt.id !== "string" ||
    !receipt.id.trim() ||
    typeof receipt.accepted_at !== "string" ||
    !Number.isFinite(Date.parse(receipt.accepted_at)) ||
    !["active", "suspicious", "verified"].includes(receipt.status ?? "")
  )
    return null;

  return {
    found: true as const,
    id: receipt.id,
    round_id: receipt.round_id,
    status: receipt.status as TelevoteRecoveryReceipt["status"],
    accepted_at: receipt.accepted_at,
    authority: "authoritative_server" as const,
  };
}

export function verifiedTelevoteReceipt(
  value: unknown,
  roundId: string,
  preflightToken: string,
): TelevoteReceipt | null {
  if (!value || typeof value !== "object") return null;
  const receipt = value as Partial<TelevoteReceipt>;
  const safe = verifiedReceiptFields(value, roundId);
  if (!safe || receipt.preflight_id !== preflightToken) return null;
  return { ...safe, preflight_id: receipt.preflight_id };
}

/**
 * Verify the deliberately low-privilege recovery response. Possession of a
 * recovery handle can establish only whether this round has an accepted vote;
 * it cannot authorize a submission, reveal the ballot, or disclose the
 * submission-capable preflight token.
 */
export function verifiedTelevoteRecoveryReceipt(
  value: unknown,
  roundId: string,
): TelevoteRecoveryReceipt | null {
  if (!value || typeof value !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(value, "preflight_id")) return null;
  return verifiedReceiptFields(value, roundId);
}

export function serializeTelevoteRecoveryCode(handle: TelevoteRecoveryHandle) {
  if (!handle.operationId.trim() || !handle.recoverySecret.trim()) return null;
  return `${handle.operationId.trim()}.${handle.recoverySecret.trim()}`;
}

export function parseTelevoteRecoveryCode(value: string): TelevoteRecoveryHandle | null {
  const normalized = value.trim();
  const separator = normalized.indexOf(".");
  if (separator <= 0 || separator === normalized.length - 1 || normalized.indexOf(".", separator + 1) >= 0) return null;
  const operationId = normalized.slice(0, separator);
  const recoverySecret = normalized.slice(separator + 1);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) return null;
  if (!/^[0-9a-f]{64}$/i.test(recoverySecret)) return null;
  return { operationId, recoverySecret };
}

/** Read evidence before retrying a write; never infer success from its error. */
export async function submitTelevoteWithReconciliation(
  submit: () => Promise<TelevoteAcceptedVote>,
  reconcile: () => Promise<TelevoteReceipt | null>,
): Promise<TelevoteAcceptedVote> {
  const read = async () => {
    try {
      return await reconcile();
    } catch {
      return null;
    }
  };
  const existing = await read();
  if (existing) return existing;
  try {
    const accepted = await submit();
    // A failed receipt read cannot undo an acknowledged successful write.
    return (await read()) ?? accepted;
  } catch (error) {
    const recovered = await read();
    if (recovered) return recovered;
    throw error;
  }
}

/** Recover only when the entire server-function response was lost in transit. */
export async function recoverTelevoteTransportResponse(
  submit: () => Promise<TelevoteAcceptedVote>,
  reconcile: () => Promise<TelevoteReceipt | null>,
): Promise<TelevoteAcceptedVote> {
  try {
    return await submit();
  } catch (error) {
    let receipt: TelevoteReceipt | null = null;
    try {
      receipt = await reconcile();
    } catch {
      /* Keep the original failure. */
    }
    if (receipt) return receipt;
    throw error;
  }
}

export function initialTelevoteStage(remembered: boolean, restoredStage?: string) {
  if (remembered) return "remembered" as const;
  return restoredStage === "vote" ? "vote" as const : "register" as const;
}

export type TelevoteAttemptSnapshot = {
  roundId: string;
  preflightToken: string;
  username: string;
  countryCode: string;
  entries: Array<{ target_country_code: string; points: number }>;
};

/** Retry planning only: this does not establish acceptance or authorize a vote. */
export function canReuseTelevoteAttempt(
  attempted: TelevoteAttemptSnapshot | null,
  current: TelevoteAttemptSnapshot,
) {
  if (!attempted || attempted.roundId !== current.roundId || !current.preflightToken || attempted.preflightToken !== current.preflightToken ||
      attempted.username.trim().toLowerCase() !== current.username.trim().toLowerCase() ||
      attempted.countryCode.toUpperCase() !== current.countryCode.toUpperCase()) return false;
  const signature = (entries: TelevoteAttemptSnapshot["entries"]) => JSON.stringify(
    entries.map((entry) => [entry.target_country_code, entry.points]).sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
  return signature(attempted.entries) === signature(current.entries);
}

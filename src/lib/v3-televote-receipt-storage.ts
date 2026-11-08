import type { GovernanceReceiptSnapshot } from "@/lib/governance-v5";

/**
 * Browser storage is shared by everyone who uses the same browser profile.
 * A locally remembered vote is a UI hint, not proof of an accepted ballot.
 * Never persist voter names, home countries, ballot choices or recovery codes.
 */
const PREFIX = "ssc_vote_receipt:";
type ReceiptStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

export type LocalTelevoteReceipt = {
  governance: GovernanceReceiptSnapshot | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeGovernance(value: unknown): GovernanceReceiptSnapshot | null {
  if (!isObject(value)) return null;
  if (value.action !== "televote.vote") return null;
  if (typeof value.rulebookVersion !== "string" || value.rulebookVersion.length > 200) return null;
  if (typeof value.capturedAt !== "string" || value.capturedAt.length > 100) return null;
  if (!Array.isArray(value.ruleIds) || value.ruleIds.length > 100 ||
      !value.ruleIds.every((id) => typeof id === "string" && id.length <= 200)) return null;
  return {
    action: "televote.vote",
    rulebookVersion: value.rulebookVersion,
    ruleIds: [...value.ruleIds] as string[],
    capturedAt: value.capturedAt,
  };
}

function normalize(raw: string): LocalTelevoteReceipt | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || !Object.prototype.hasOwnProperty.call(parsed, "governance")) return null;
    return { governance: safeGovernance(parsed.governance) };
  } catch {
    return null;
  }
}

export function televoteReceiptStorageKey(roundId: string): string {
  return `${PREFIX}${roundId}`;
}

function cleanOne(storage: ReceiptStorage, key: string): LocalTelevoteReceipt | null {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const receipt = normalize(raw);
    if (!receipt) {
      storage.removeItem(key);
      return null;
    }
    const safe = JSON.stringify(receipt);
    // Upgrade old receipts in place: previously they retained the user's
    // name, home country and unpublished ballot indefinitely.
    if (safe !== raw) storage.setItem(key, safe);
    return receipt;
  } catch {
    // If sanitization cannot be persisted, do not leave the legacy ballot.
    try { storage.removeItem(key); } catch { /* Storage may be unavailable. */ }
    return null;
  }
}

/** Scrub *all* historical rounds on visit, not only the currently open one. */
export function scrubTelevoteReceipts(storage: ReceiptStorage): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) cleanOne(storage, key);
  } catch {
    // A blocked storage API is never a reason to block an authoritative vote.
  }
}

export function readTelevoteReceipt(
  storage: ReceiptStorage,
  roundId: string,
): LocalTelevoteReceipt | null {
  return cleanOne(storage, televoteReceiptStorageKey(roundId));
}

export function writeTelevoteReceipt(
  storage: ReceiptStorage,
  roundId: string,
  governance: GovernanceReceiptSnapshot | null,
): void {
  storage.setItem(
    televoteReceiptStorageKey(roundId),
    JSON.stringify({ governance: safeGovernance(governance) } satisfies LocalTelevoteReceipt),
  );
}

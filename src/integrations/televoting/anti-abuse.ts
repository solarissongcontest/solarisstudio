import { captureGovernanceSnapshot } from "@/lib/governance-v5";
import { createSecureClientId } from "@/lib/secure-client-id";
import {
  dispatchSubmissionReceipt,
  TELEVOTE_SUBMITTED_EVENT,
} from "@/lib/submission-receipts";

const DEVICE_KEY = "solaris.device_token.v1";
const SUBMITTED_KEY = "solaris.submitted_rounds.v1";

async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Storage may be blocked (private browsing, policy, quota). Reuse a securely
// generated page-lifetime identity instead of changing it on every preflight.
let transientDeviceToken: string | null = null;

function getOrCreateDeviceToken(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    // Preserve identifiers already associated with accepted ballots. Rotating
    // them during a live round could undermine the server's duplicate checks.
    if (existing) return existing;
  } catch {
    // Continue with a cryptographically strong in-memory identity.
  }

  if (transientDeviceToken) return transientDeviceToken;
  const fresh = createSecureClientId();
  if (!fresh) {
    throw new Error("Secure browser cryptography is required for televoting identity");
  }

  transientDeviceToken = fresh;
  try {
    localStorage.setItem(DEVICE_KEY, fresh);
  } catch {
    // In-memory identity is stable for this page. Server checks stay authoritative.
  }
  return fresh;
}

function fingerprintSeed() {
  const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);
  const display = typeof screen !== "undefined" ? screen : ({} as Screen);
  return [
    nav.userAgent ?? "",
    nav.language ?? "",
    (nav as Navigator & { languages?: readonly string[] }).languages?.join(",") ?? "",
    nav.hardwareConcurrency ?? "",
    (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? "",
    display.width ?? "",
    display.height ?? "",
    display.colorDepth ?? "",
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
  ].join("|");
}

export async function buildTelevotingClientIdentity() {
  // Fail before hashing if secure entropy is unavailable. Never send a hash of
  // an empty or guessable newly generated token to the anti-abuse authority.
  const deviceToken = getOrCreateDeviceToken();
  const [fingerprintHash, deviceTokenHash] = await Promise.all([
    sha256(`solaris-fp:${fingerprintSeed()}`),
    sha256(`solaris-dev:${deviceToken}`),
  ]);
  return { fingerprintHash, deviceTokenHash };
}

export function markTelevotingRoundSubmitted(
  roundId: string,
  receipt: { submissionId: string; acknowledgedAt?: string | null },
) {
  if (!receipt.submissionId.trim()) {
    throw new Error("A server submission id is required to confirm a ballot");
  }
  try {
    const raw = localStorage.getItem(SUBMITTED_KEY);
    const rounds: string[] = raw ? JSON.parse(raw) : [];
    if (!rounds.includes(roundId)) rounds.push(roundId);
    localStorage.setItem(SUBMITTED_KEY, JSON.stringify(rounds));
  } catch {
    // Database-level duplicate checks remain authoritative.
  }

  // This function is only called after the server has accepted the ballot.
  // The receipt event drives the shared
  // pending → confirmed UI without weakening any database-side protection.
  const governance = captureGovernanceSnapshot("televote.vote");
  dispatchSubmissionReceipt(TELEVOTE_SUBMITTED_EVENT, roundId, {
    kind: "televote",
    submissionId: receipt.submissionId,
    acknowledgedAt: receipt.acknowledgedAt ?? null,
    governance,
  });
  return governance;
}

export function hasSubmittedTelevotingRound(roundId: string) {
  try {
    const raw = localStorage.getItem(SUBMITTED_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as string[]).includes(roundId);
  } catch {
    return false;
  }
}

const DEVICE_KEY = "solaris.device_token.v1";
const SUBMITTED_KEY = "solaris.submitted_rounds.v1";

async function sha256(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function getOrCreateDeviceToken() {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const fresh =
      crypto.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return `ephemeral-${Math.random().toString(36).slice(2)}`;
  }
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
  const [fingerprintHash, deviceTokenHash] = await Promise.all([
    sha256(`solaris-fp:${fingerprintSeed()}`),
    sha256(`solaris-dev:${getOrCreateDeviceToken()}`),
  ]);
  return { fingerprintHash, deviceTokenHash };
}

export function markTelevotingRoundSubmitted(roundId: string) {
  try {
    const raw = localStorage.getItem(SUBMITTED_KEY);
    const rounds: string[] = raw ? JSON.parse(raw) : [];
    if (!rounds.includes(roundId)) rounds.push(roundId);
    localStorage.setItem(SUBMITTED_KEY, JSON.stringify(rounds));
  } catch {
    // Database-level duplicate checks remain authoritative.
  }
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

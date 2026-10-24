import type { IntegrityCategory, IntegrityIdentityMode } from "@/lib/integrity";

export type IntegrityReportV5Draft = {
  category: IntegrityCategory | "";
  identityMode: IntegrityIdentityMode | "";
  summary: string;
  details: string;
  observedFacts: string;
  uncertainties: string;
  relatedCountries: string;
  editionReference: string;
  createdAt: string;
  updatedAt: string;
};

export type IntegrityReportV5SubmissionIdentity = {
  operationId: string;
  idempotencyKey: string;
  createdAt: string;
};

export type IntegrityReportV5Receipt =
  | {
      kind: "anonymous";
      caseCode: string;
      recoveryKey: string;
      operationId?: string;
      createdAt: string;
    }
  | {
      kind: "protected";
      caseCode: string;
      caseId: string;
      operationId?: string;
      receiptId?: string;
      createdAt: string;
    };

const DRAFT_KEY = "solaris:integrity-report-v5:draft";
const RECEIPT_KEY = "solaris:integrity-report-v5:receipt";
const SUBMISSION_IDENTITY_KEY = "solaris:integrity-report-v5:submission-identity";

const SEMANTIC_DRAFT_KEYS = [
  "category",
  "identityMode",
  "summary",
  "details",
  "observedFacts",
  "uncertainties",
  "relatedCountries",
  "editionReference",
] as const satisfies ReadonlyArray<keyof IntegrityReportV5Draft>;

let memorySubmissionIdentity: IntegrityReportV5SubmissionIdentity | null = null;
let memoryReceipt: IntegrityReportV5Receipt | null = null;

export const EMPTY_INTEGRITY_REPORT_V5: IntegrityReportV5Draft = {
  category: "",
  identityMode: "",
  summary: "",
  details: "",
  observedFacts: "",
  uncertainties: "",
  relatedCountries: "",
  editionReference: "",
  createdAt: "",
  updatedAt: "",
};

function session(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isSubmissionIdentity(value: unknown): value is IntegrityReportV5SubmissionIdentity {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<IntegrityReportV5SubmissionIdentity>;
  return (
    typeof candidate.operationId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      candidate.operationId,
    ) &&
    typeof candidate.idempotencyKey === "string" &&
    /^[0-9a-f]{64}$/.test(candidate.idempotencyKey) &&
    typeof candidate.createdAt === "string"
  );
}

function secureRandomBytes(length: number) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error("Secure retry identity is unavailable in this browser.");
  }
  return cryptoApi.getRandomValues(new Uint8Array(length));
}

function randomUuidV4() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  const bytes = secureRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randomHex(bytes: number) {
  return Array.from(secureRandomBytes(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readIntegrityReportV5SubmissionIdentity(): IntegrityReportV5SubmissionIdentity | null {
  try {
    const raw = session()?.getItem(SUBMISSION_IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isSubmissionIdentity(parsed)) {
        memorySubmissionIdentity = parsed;
        return parsed;
      }
    }
  } catch {
    // Fall through to the in-memory identity for the current page lifetime.
  }
  return memorySubmissionIdentity;
}

export function getOrCreateIntegrityReportV5SubmissionIdentity(): IntegrityReportV5SubmissionIdentity {
  const existing = readIntegrityReportV5SubmissionIdentity();
  if (existing) return existing;

  const identity: IntegrityReportV5SubmissionIdentity = {
    operationId: randomUuidV4(),
    idempotencyKey: randomHex(32),
    createdAt: new Date().toISOString(),
  };
  memorySubmissionIdentity = identity;

  try {
    session()?.setItem(SUBMISSION_IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    // Keep the same identity in memory so an in-page retry remains exact-once.
  }

  return identity;
}

export function clearIntegrityReportV5SubmissionIdentity() {
  memorySubmissionIdentity = null;
  try {
    session()?.removeItem(SUBMISSION_IDENTITY_KEY);
  } catch {
    // Best effort.
  }
}

export function readIntegrityReportV5Draft(): IntegrityReportV5Draft {
  try {
    const raw = session()?.getItem(DRAFT_KEY);
    if (!raw) return { ...EMPTY_INTEGRITY_REPORT_V5 };
    const parsed = JSON.parse(raw) as Partial<IntegrityReportV5Draft>;
    return {
      ...EMPTY_INTEGRITY_REPORT_V5,
      ...parsed,
      category: (parsed.category ?? "") as IntegrityReportV5Draft["category"],
      identityMode: (parsed.identityMode ?? "") as IntegrityReportV5Draft["identityMode"],
    };
  } catch {
    return { ...EMPTY_INTEGRITY_REPORT_V5 };
  }
}

export function writeIntegrityReportV5Draft(patch: Partial<IntegrityReportV5Draft>) {
  const current = readIntegrityReportV5Draft();
  const semanticChange = SEMANTIC_DRAFT_KEYS.some(
    (key) => Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== current[key],
  );
  if (semanticChange) clearIntegrityReportV5SubmissionIdentity();

  const now = new Date().toISOString();
  const next: IntegrityReportV5Draft = {
    ...current,
    ...patch,
    createdAt: current.createdAt || now,
    updatedAt: now,
  };
  try {
    session()?.setItem(DRAFT_KEY, JSON.stringify(next));
  } catch {
    // Sensitive drafts remain session-only by design and may be memory-only if storage is unavailable.
  }
  return next;
}

export function clearIntegrityReportV5Draft() {
  clearIntegrityReportV5SubmissionIdentity();
  try {
    session()?.removeItem(DRAFT_KEY);
  } catch {
    // Best effort.
  }
}

export function writeIntegrityReportV5Receipt(receipt: IntegrityReportV5Receipt) {
  // Keep the authoritative response reachable across client-side navigation even
  // when privacy settings or quota errors make sessionStorage unavailable. This
  // matters most for anonymous reports because the recovery key is returned only
  // in the successful create/replay response.
  memoryReceipt = receipt;
  try {
    session()?.setItem(RECEIPT_KEY, JSON.stringify(receipt));
  } catch {
    // The in-memory copy remains available for this page lifetime.
  }
}

export function readIntegrityReportV5Receipt(): IntegrityReportV5Receipt | null {
  try {
    const raw = session()?.getItem(RECEIPT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as IntegrityReportV5Receipt;
      memoryReceipt = parsed;
      return parsed;
    }
  } catch {
    // Fall through to the in-memory authoritative response.
  }
  return memoryReceipt;
}

export function clearIntegrityReportV5Receipt() {
  memoryReceipt = null;
  try {
    session()?.removeItem(RECEIPT_KEY);
  } catch {
    // Best effort.
  }
}

export type PrivacySignal = {
  kind: "email" | "phone" | "handle";
  value: string;
};

export function detectIntegrityPrivacySignals(draft: IntegrityReportV5Draft): PrivacySignal[] {
  const text = [draft.summary, draft.details, draft.observedFacts, draft.uncertainties].join("\n");
  const signals: PrivacySignal[] = [];
  const seen = new Set<string>();

  const add = (kind: PrivacySignal["kind"], value: string) => {
    const key = kind + ":" + value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    signals.push({ kind, value });
  };

  for (const match of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) add("email", match[0]);
  for (const match of text.matchAll(/(?:\+?\d[\d ()-]{7,}\d)/g)) add("phone", match[0].trim());
  for (const match of text.matchAll(/@[A-Za-z0-9._]{2,32}/g)) add("handle", match[0]);

  return signals.slice(0, 12);
}

export function integrityCategoryPrompt(category: IntegrityCategory | "") {
  switch (category) {
    case "voting_integrity":
    case "vote_coordination":
      return {
        title: "Voting context",
        observed: "What voting activity did you directly observe?",
        uncertainty: "What are you unsure about, for example whether an agreement actually existed?",
      };
    case "entry_eligibility":
      return {
        title: "Entry context",
        observed: "What eligibility fact did you directly observe?",
        uncertainty: "Which part of the entry's eligibility are you unsure about?",
      };
    case "technical_exploit":
      return {
        title: "Technical context",
        observed: "What behavior did you reproduce or directly observe?",
        uncertainty: "What impact or exploitability are you unsure about?",
      };
    case "safety":
    case "privacy":
      return {
        title: "Safety & privacy context",
        observed: "What happened or what information was exposed?",
        uncertainty: "What details are uncertain or still developing?",
      };
    case "tsbc_conduct":
      return {
        title: "Administration context",
        observed: "What action or decision did you directly observe?",
        uncertainty: "What part do you believe needs independent review?",
      };
    default:
      return {
        title: "Supporting context",
        observed: "What did you directly observe?",
        uncertainty: "Is there anything you're unsure about?",
      };
  }
}

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

export type IntegrityReportV5Receipt =
  | {
      kind: "anonymous";
      caseCode: string;
      recoveryKey: string;
      createdAt: string;
    }
  | {
      kind: "protected";
      caseCode: string;
      caseId: string;
      createdAt: string;
    };

const DRAFT_KEY = "solaris:integrity-report-v5:draft";
const RECEIPT_KEY = "solaris:integrity-report-v5:receipt";

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
  try {
    session()?.removeItem(DRAFT_KEY);
  } catch {
    // Best effort.
  }
}

export function writeIntegrityReportV5Receipt(receipt: IntegrityReportV5Receipt) {
  try {
    session()?.setItem(RECEIPT_KEY, JSON.stringify(receipt));
  } catch {
    // The server-created case remains authoritative.
  }
}

export function readIntegrityReportV5Receipt(): IntegrityReportV5Receipt | null {
  try {
    const raw = session()?.getItem(RECEIPT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as IntegrityReportV5Receipt;
  } catch {
    return null;
  }
}

export function clearIntegrityReportV5Receipt() {
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

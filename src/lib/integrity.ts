export const INTEGRITY_CATEGORIES = [
  {
    id: "voting_integrity",
    label: "Voting integrity",
    short: "Suspicious voting pattern or manipulation",
    description: "Something about jury or televote activity may not be independent or genuine.",
    icon: "Vote",
  },
  {
    id: "vote_coordination",
    label: "Vote trading or coordination",
    short: "People may have agreed how to vote",
    description: "A vote exchange, reciprocal promise or coordinated ranking may have been discussed.",
    icon: "Handshake",
  },
  {
    id: "entry_eligibility",
    label: "Entry eligibility",
    short: "Artist, song or video may be ineligible",
    description: "An entry may conflict with artist, song, Eurovision, popularity or reuse rules.",
    icon: "Music2",
  },
  {
    id: "account_abuse",
    label: "Account abuse",
    short: "Fake, duplicate or misused account",
    description: "An account may have been used to gain extra voting, confirmation or other competitive rights.",
    icon: "UserRoundX",
  },
  {
    id: "conduct",
    label: "Conduct",
    short: "Harassment, bullying or repeated abuse",
    description: "A participant's behaviour may breach SSC community standards.",
    icon: "MessageCircleWarning",
  },
  {
    id: "safety",
    label: "Safety concern",
    short: "Threats, doxxing or an urgent safety issue",
    description: "A serious concern involving threats, privacy exposure or participant safety.",
    icon: "Siren",
  },
  {
    id: "privacy",
    label: "Privacy",
    short: "Private information may have been exposed or misused",
    description: "A concern involving doxxing, sensitive data or inappropriate disclosure.",
    icon: "LockKeyhole",
  },
  {
    id: "technical_exploit",
    label: "Technical exploit",
    short: "A Solaris Studio bug may be abused",
    description: "Report a vulnerability, exploit or technical method that could create an unfair advantage.",
    icon: "Bug",
  },
  {
    id: "tsbc_conduct",
    label: "TSBC or administrator concern",
    short: "A decision or official's conduct needs independent review",
    description: "A concern about administration, a conflict of interest or a TSBC official.",
    icon: "Landmark",
  },
  {
    id: "other",
    label: "Something else",
    short: "You are unsure which category fits",
    description: "Tell TSBC what happened without having to classify the rule yourself.",
    icon: "CircleHelp",
  },
] as const;

export type IntegrityCategory = (typeof INTEGRITY_CATEGORIES)[number]["id"];

export const INTEGRITY_STATUS = {
  received: { label: "Received", description: "The report is safely in the system." },
  awaiting_review: { label: "Awaiting review", description: "The case is waiting for an authorised reviewer." },
  under_review: { label: "Under review", description: "TSBC is reviewing the available information." },
  waiting_for_reporter: { label: "Waiting for you", description: "TSBC has asked the reporter for more information." },
  investigation_opened: { label: "Investigation opened", description: "The concern has moved into a formal investigation." },
  action_taken: { label: "Action taken", description: "TSBC has taken an appropriate action in response to the case." },
  closed_no_violation: { label: "No violation found", description: "The review did not establish a rule violation." },
  closed_insufficient_evidence: { label: "Insufficient evidence", description: "The available information was not enough to establish a violation." },
  closed_outside_jurisdiction: { label: "Outside SSC scope", description: "The matter did not have enough connection to SSC for TSBC to act." },
  closed_duplicate: { label: "Linked / duplicate", description: "The information is being handled together with another case." },
  closed: { label: "Closed", description: "The case review has finished." },
} as const;

export type IntegrityCaseStatus = keyof typeof INTEGRITY_STATUS;
export type IntegrityPriority = "information" | "standard" | "high" | "urgent";

export type AnonymousCaseMessage = {
  id: string;
  author_role: "reporter" | "tsbc";
  body: string;
  created_at: string;
};

export type AnonymousCaseEvent = {
  id: string;
  event_type: string;
  detail: string | null;
  created_at: string;
};

export type AnonymousCaseData = {
  id: string;
  public_code: string;
  category: IntegrityCategory;
  identity_mode: "anonymous";
  summary: string;
  details: string;
  observed_facts: string | null;
  uncertainties: string | null;
  related_countries: string[];
  edition_reference: string | null;
  status: IntegrityCaseStatus;
  priority: IntegrityPriority;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type AnonymousCaseSnapshot = {
  case: AnonymousCaseData;
  messages: AnonymousCaseMessage[];
  events: AnonymousCaseEvent[];
};

export type AnonymousCaseCredential = {
  caseCode: string;
  recoveryKey: string;
  savedAt: string;
};

const LOCAL_CASES_KEY = "solaris:anonymous-integrity-cases:v1";

export function getIntegrityCategory(id: string) {
  return INTEGRITY_CATEGORIES.find((category) => category.id === id) ?? INTEGRITY_CATEGORIES.at(-1)!;
}

export function formatIntegrityStatus(status: string) {
  return INTEGRITY_STATUS[status as IntegrityCaseStatus] ?? {
    label: status.replaceAll("_", " "),
    description: "Case status updated.",
  };
}

export function readAnonymousCasesFromDevice(): AnonymousCaseCredential[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_CASES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AnonymousCaseCredential[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.caseCode && item?.recoveryKey)
      .slice(0, 20);
  } catch {
    return [];
  }
}

export function saveAnonymousCaseOnDevice(credential: AnonymousCaseCredential) {
  if (typeof window === "undefined") return;
  const current = readAnonymousCasesFromDevice().filter(
    (item) => item.caseCode !== credential.caseCode,
  );
  window.localStorage.setItem(
    LOCAL_CASES_KEY,
    JSON.stringify([credential, ...current].slice(0, 20)),
  );
}

export function forgetAnonymousCaseOnDevice(caseCode: string) {
  if (typeof window === "undefined") return;
  const next = readAnonymousCasesFromDevice().filter(
    (item) => item.caseCode !== caseCode,
  );
  window.localStorage.setItem(LOCAL_CASES_KEY, JSON.stringify(next));
}

export const INTEGRITY_CATEGORIES = [
  { id: "voting_integrity", label: "Voting integrity", short: "Suspicious voting pattern or manipulation", description: "Something about jury or televote activity may not be independent or genuine.", icon: "Vote" },
  { id: "vote_coordination", label: "Vote trading or coordination", short: "People may have agreed how to vote", description: "A vote exchange, reciprocal promise or coordinated ranking may have been discussed.", icon: "Handshake" },
  { id: "entry_eligibility", label: "Entry eligibility", short: "Artist, song or video may be ineligible", description: "An entry may conflict with artist, song, Eurovision, popularity or reuse rules.", icon: "Music2" },
  { id: "account_abuse", label: "Account abuse", short: "Fake, duplicate or misused account", description: "An account may have been used to gain extra voting, confirmation or other competitive rights.", icon: "UserRoundX" },
  { id: "conduct", label: "Conduct", short: "Harassment, bullying or repeated abuse", description: "A participant's behaviour may breach SSC community standards.", icon: "MessageCircleWarning" },
  { id: "safety", label: "Safety concern", short: "Threats, doxxing or an urgent safety issue", description: "A serious concern involving threats, privacy exposure or participant safety.", icon: "Siren" },
  { id: "privacy", label: "Privacy", short: "Private information may have been exposed or misused", description: "A concern involving doxxing, sensitive data or inappropriate disclosure.", icon: "LockKeyhole" },
  { id: "technical_exploit", label: "Technical exploit", short: "A Solaris Studio bug may be abused", description: "Report a vulnerability, exploit or technical method that could create an unfair advantage.", icon: "Bug" },
  { id: "tsbc_conduct", label: "TSBC or administrator concern", short: "A decision or official's conduct needs independent review", description: "A concern about administration, a conflict of interest or a TSBC official.", icon: "Landmark" },
  { id: "other", label: "Something else / I'm not sure", short: "You do not need to classify the rule yourself", description: "Tell TSBC what happened even if you are unsure which category or rule fits.", icon: "CircleHelp" },
] as const;

export type IntegrityCategory = (typeof INTEGRITY_CATEGORIES)[number]["id"];
export type IntegrityIdentityMode = "anonymous" | "sealed" | "confidential";
export type IntegrityCaseKind = "report" | "self_report" | "rule_question" | "vulnerability" | "safety";

export const INTEGRITY_IDENTITY_MODES = {
  anonymous: {
    label: "Fully anonymous",
    short: "No Solaris account is attached to the case record.",
    detail: "You return with a case code and recovery key. TSBC case reviewers do not receive a Solaris account identity from the case.",
  },
  sealed: {
    label: "Sealed identity",
    short: "Your account recovers the case, but ordinary reviewers cannot reveal your identity.",
    detail: "Solaris links the case to your account for recovery and notifications. The normal organizer identity function refuses sealed cases. In an exceptional break-glass situation, disclosure requires a written reason, approval by a second different organizer, a 30-minute one-use approval and a reporter-visible audit event if the identity is actually revealed.",
  },
  confidential: {
    label: "Confidential",
    short: "Authorised TSBC reviewers may identify you when necessary.",
    detail: "Your identity is not shown by default. Access requires an explicit organizer action which is written to the case audit trail.",
  },
} as const;

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

export type IntegrityCaseMessage = {
  id: string;
  author_role: "reporter" | "tsbc" | "witness" | "participant";
  body: string;
  created_at: string;
};

export type IntegrityCaseEvent = {
  id: string;
  event_type: string;
  detail: string | null;
  created_at: string;
};

export type IntegrityFinding = {
  id: string;
  outcome: "violation" | "no_violation" | "insufficient_evidence" | "outside_jurisdiction" | "duplicate" | "administrative_resolution";
  summary: string;
  rationale: string;
  rule_ids: string[];
  created_at: string;
};

export type IntegrityEvidence = {
  id: string;
  source_role: "reporter" | "tsbc" | "witness" | "participant" | "system";
  evidence_type: "file" | "url" | "text" | "voting_analysis" | "statement";
  title: string;
  description: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  external_url: string | null;
  redacted_from_id: string | null;
  disclosure_copy_of_id: string | null;
  created_at: string;
};

export type IntegrityRequest = {
  id: string;
  request_kind: "clarification" | "evidence" | "response" | "identity_consent";
  prompt: string;
  status: "open" | "responded" | "closed";
  created_at: string;
  responded_at: string | null;
};

export type IntegrityCaseData = {
  id: string;
  public_code: string;
  case_kind: IntegrityCaseKind;
  category: IntegrityCategory;
  identity_mode: IntegrityIdentityMode;
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

export type IntegrityCaseSnapshot = {
  case: IntegrityCaseData;
  messages: IntegrityCaseMessage[];
  events: IntegrityCaseEvent[];
  findings: IntegrityFinding[];
  evidence: IntegrityEvidence[];
  requests: IntegrityRequest[];
};

export type AnonymousCaseData = IntegrityCaseData & { identity_mode: "anonymous" };
export type AnonymousCaseMessage = IntegrityCaseMessage;
export type AnonymousCaseEvent = IntegrityCaseEvent;
export type AnonymousCaseSnapshot = IntegrityCaseSnapshot & { case: AnonymousCaseData };

export type AnonymousCaseCredential = {
  caseCode: string;
  recoveryKey: string;
  savedAt: string;
};

export type ProtectedCaseListItem = Pick<
  IntegrityCaseData,
  "id" | "public_code" | "case_kind" | "category" | "identity_mode" | "summary" | "status" | "priority" | "created_at" | "updated_at"
>;

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
    return parsed.filter((item) => item?.caseCode && item?.recoveryKey).slice(0, 20);
  } catch {
    return [];
  }
}

export function saveAnonymousCaseOnDevice(credential: AnonymousCaseCredential) {
  if (typeof window === "undefined") return;
  const current = readAnonymousCasesFromDevice().filter((item) => item.caseCode !== credential.caseCode);
  window.localStorage.setItem(LOCAL_CASES_KEY, JSON.stringify([credential, ...current].slice(0, 20)));
}

export function forgetAnonymousCaseOnDevice(caseCode: string) {
  if (typeof window === "undefined") return;
  const next = readAnonymousCasesFromDevice().filter((item) => item.caseCode !== caseCode);
  window.localStorage.setItem(LOCAL_CASES_KEY, JSON.stringify(next));
}

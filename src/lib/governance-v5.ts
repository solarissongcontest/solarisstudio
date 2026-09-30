import { SSC_RULEBOOK, getRuleById } from "@/lib/ssc-rules-v4";

export type GovernanceActionKey =
  | "confirmation.submit"
  | "entry.submit"
  | "jury.vote"
  | "televote.vote"
  | "integrity.report"
  | "integrity.appeal"
  | "integrity.guidance"
  | "hosting.accept";

export type GovernancePurpose =
  | "required"
  | "deadline"
  | "eligibility"
  | "fairness"
  | "integrity"
  | "privacy"
  | "information";

export type GovernanceRuleBinding = {
  ruleId: string;
  purpose: GovernancePurpose;
  prominence: "primary" | "secondary";
  contextualSummary: string;
};

export type GovernanceActionDefinition = {
  key: GovernanceActionKey;
  title: string;
  intro: string;
  bindings: GovernanceRuleBinding[];
};

const DEFINITIONS: Record<GovernanceActionKey, GovernanceActionDefinition> = {
  "confirmation.submit": {
    key: "confirmation.submit",
    title: "Confirmation rules",
    intro:
      "Official opening time, trusted server order and fair access govern confirmation submissions.",
    bindings: [
      {
        ruleId: "4.6",
        purpose: "deadline",
        prominence: "primary",
        contextualSummary:
          "Valid limited confirmations are ordered by the trusted Solaris server receipt time after the published opening. A device countdown does not decide official order.",
      },
      {
        ruleId: "4.3",
        purpose: "fairness",
        prominence: "primary",
        contextualSummary:
          "Bots, scripts or technical methods must not be used to obtain an unfair competitive confirmation advantage.",
      },
      {
        ruleId: "4.7",
        purpose: "required",
        prominence: "secondary",
        contextualSummary:
          "A confirmation must satisfy the published requirements for that round before it can create participation rights.",
      },
      {
        ruleId: "20.1",
        purpose: "information",
        prominence: "secondary",
        contextualSummary:
          "Edition-specific confirmation limits, dates and variables supplement the permanent General Regulations.",
      },
    ],
  },
  "entry.submit": {
    key: "entry.submit",
    title: "Entry submission rules",
    intro:
      "Entry eligibility, verification and the published submission deadline apply to the official entry task.",
    bindings: [
      {
        ruleId: "6.2",
        purpose: "eligibility",
        prominence: "primary",
        contextualSummary:
          "The recording and required presentation media must meet the official availability requirements.",
      },
      {
        ruleId: "6.4",
        purpose: "eligibility",
        prominence: "primary",
        contextualSummary:
          "Popularity limits are checked against the published threshold at the official eligibility reference time.",
      },
      {
        ruleId: "6.5",
        purpose: "eligibility",
        prominence: "primary",
        contextualSummary:
          "Eurovision and relevant National Selection history restrictions apply to the proposed entry.",
      },
      {
        ruleId: "6.6",
        purpose: "eligibility",
        prominence: "primary",
        contextualSummary:
          "SSC artist-reuse and previous-winner restrictions are checked as contest eligibility rules.",
      },
      {
        ruleId: "6.10",
        purpose: "required",
        prominence: "secondary",
        contextualSummary:
          "TSBC records the official eligibility reference point so later popularity changes do not rewrite an already completed check.",
      },
      {
        ruleId: "12.3",
        purpose: "deadline",
        prominence: "secondary",
        contextualSummary:
          "Required entries and jury work must be submitted before the corresponding published deadline unless an authorised exception applies.",
      },
    ],
  },
  "jury.vote": {
    key: "jury.vote",
    title: "Jury voting rules",
    intro:
      "A jury ballot is an official delegation vote and must represent the delegation's own independent judgement.",
    bindings: [
      {
        ruleId: "9.2",
        purpose: "required",
        prominence: "primary",
        contextualSummary:
          "The jury ranking must reflect the delegation's own independent judgement and must not be outsourced or copied from another participant.",
      },
      {
        ruleId: "11.2",
        purpose: "integrity",
        prominence: "primary",
        contextualSummary:
          "Agreed rankings, reciprocal support and coordinated voting arrangements are prohibited.",
      },
      {
        ruleId: "11.4",
        purpose: "fairness",
        prominence: "primary",
        contextualSummary:
          "Friendship or knowing another participant does not by itself invalidate a vote; the ballot must still reflect genuine independent preference.",
      },
      {
        ruleId: "11.5",
        purpose: "fairness",
        prominence: "secondary",
        contextualSummary:
          "Automated or statistical voting signals can trigger review, but they are not proof of misconduct.",
      },
    ],
  },
  "televote.vote": {
    key: "televote.vote",
    title: "Televoting rules",
    intro:
      "Official-system voting, independent preference and anti-coordination rules apply to every public ballot.",
    bindings: [
      {
        ruleId: "10.1",
        purpose: "required",
        prominence: "primary",
        contextualSummary:
          "Only votes submitted through the official Solaris televoting system under the published round rules count.",
      },
      {
        ruleId: "11.2",
        purpose: "integrity",
        prominence: "primary",
        contextualSummary:
          "Do not arrange vote exchanges, reciprocal support or coordinated voting with other participants.",
      },
      {
        ruleId: "11.4",
        purpose: "fairness",
        prominence: "primary",
        contextualSummary:
          "Vote for the entries you genuinely prefer. Personal relationships alone do not make a vote improper.",
      },
      {
        ruleId: "11.5",
        purpose: "information",
        prominence: "secondary",
        contextualSummary:
          "Automated integrity analysis is a review signal only and does not itself establish misconduct.",
      },
    ],
  },
  "integrity.report": {
    key: "integrity.report",
    title: "Reporting & investigation rules",
    intro:
      "A report starts review; it is not itself a finding that somebody broke a rule.",
    bindings: [
      {
        ruleId: "16.1",
        purpose: "information",
        prominence: "primary",
        contextualSummary:
          "A genuine concern can be reported without the reporter having to prove a violation before submitting.",
      },
      {
        ruleId: "16.3",
        purpose: "privacy",
        prominence: "primary",
        contextualSummary:
          "Anonymous, sealed and confidential reporting modes must preserve the privacy promise made to the reporter.",
      },
      {
        ruleId: "16.6",
        purpose: "fairness",
        prominence: "primary",
        contextualSummary:
          "A report, flag or investigation is not a finding of misconduct; evidence must be assessed fairly and in context.",
      },
    ],
  },
  "integrity.appeal": {
    key: "integrity.appeal",
    title: "Appeal rules",
    intro:
      "Eligible sanctions can be challenged through a fresh review process within the applicable appeal window.",
    bindings: [
      {
        ruleId: "18.1",
        purpose: "deadline",
        prominence: "primary",
        contextualSummary:
          "Eligible official sanctions may normally be appealed within the published appeal period.",
      },
      {
        ruleId: "18.3",
        purpose: "fairness",
        prominence: "primary",
        contextualSummary:
          "A serious appeal should receive genuine fresh review where another eligible reviewer is reasonably available.",
      },
    ],
  },
  "integrity.guidance": {
    key: "integrity.guidance",
    title: "Private rule guidance",
    intro:
      "Ask before acting when the rule is unclear; an official answer can cite the exact rules that govern the described circumstances.",
    bindings: [
      {
        ruleId: "21.1",
        purpose: "information",
        prominence: "primary",
        contextualSummary:
          "Official interpretation exists to resolve ambiguity consistently without silently rewriting the rulebook.",
      },
    ],
  },
  "hosting.accept": {
    key: "hosting.accept",
    title: "Hosting rules",
    intro:
      "Creative hosting rights are online presentation rights; TSBC retains operational and disciplinary authority.",
    bindings: [
      {
        ruleId: "8.1",
        purpose: "information",
        prominence: "primary",
        contextualSummary:
          "Winning creates the first right to creatively host the next online edition, subject to the published hosting framework.",
      },
      {
        ruleId: "8.2",
        purpose: "information",
        prominence: "secondary",
        contextualSummary:
          "Creative hosting does not transfer TSBC's voting, rules, integrity or core operational authority.",
      },
    ],
  },
};

export type GovernanceResolvedRule = GovernanceRuleBinding & {
  id: string;
  title: string;
  canonicalSummary: string;
  chapterNumber?: number;
  chapterTitle?: string;
};

export function governanceDefinition(key: GovernanceActionKey) {
  return DEFINITIONS[key];
}

export function governanceRules(key: GovernanceActionKey): GovernanceResolvedRule[] {
  return DEFINITIONS[key].bindings.flatMap((binding) => {
    const rule = getRuleById(binding.ruleId);
    if (!rule) return [];
    return [
      {
        ...binding,
        id: rule.id,
        title: rule.title,
        canonicalSummary: rule.summary,
        chapterNumber: "chapterNumber" in rule ? rule.chapterNumber : undefined,
        chapterTitle: "chapterTitle" in rule ? rule.chapterTitle : undefined,
      },
    ];
  });
}

export function primaryGovernanceRules(key: GovernanceActionKey) {
  return governanceRules(key).filter((rule) => rule.prominence === "primary");
}

export const GOVERNANCE_ACTION_KEYS = Object.keys(DEFINITIONS) as GovernanceActionKey[];

export type GovernanceQuickAnswer = {
  id: string;
  question: string;
  answer: "Yes" | "No" | "Depends" | "Needs review";
  explanation: string;
  ruleIds: string[];
  phrases: string[];
};

export const GOVERNANCE_QUICK_ANSWERS: GovernanceQuickAnswer[] = [
  {
    id: "friend-vote",
    question: "Can I vote highly for a friend's song?",
    answer: "Yes",
    explanation:
      "Friendship itself is allowed. Your vote must still reflect your own genuine independent preference.",
    ruleIds: ["11.4", "11.2"],
    phrases: ["friend vote", "friend voting", "friend give points", "friend 12 points", "vote for friend"],
  },
  {
    id: "vote-exchange",
    question: "Can we agree to exchange high points?",
    answer: "No",
    explanation:
      "Reciprocal or coordinated voting arrangements are prohibited even if both people would otherwise like the entries.",
    ruleIds: ["11.2"],
    phrases: ["trade points", "exchange votes", "exchange points", "reciprocal vote", "coordinate votes"],
  },
  {
    id: "eurovision-artist",
    question: "Can I use an artist who competed in Eurovision?",
    answer: "No",
    explanation:
      "The current SSC entry-eligibility rules restrict artists with the relevant Eurovision participation history.",
    ruleIds: ["6.5"],
    phrases: ["eurovision artist", "artist competed eurovision", "eurovision singer"],
  },
  {
    id: "anonymous-report",
    question: "Can I report a concern anonymously?",
    answer: "Yes",
    explanation:
      "Solaris supports fully anonymous reporting without attaching a Solaris reporter account to the case.",
    ruleIds: ["16.3"],
    phrases: ["anonymous report", "report anonymously", "hide identity"],
  },
  {
    id: "flag-proof",
    question: "Does an Integrity flag mean someone is guilty?",
    answer: "No",
    explanation:
      "Automated and statistical signals can trigger human review but do not establish a rule violation by themselves.",
    ruleIds: ["11.5", "16.6"],
    phrases: ["flag guilt", "integrity flag proof", "friend voting flag", "automatic flag"],
  },
  {
    id: "miss-deadline",
    question: "What happens if I miss an official deadline?",
    answer: "Depends",
    explanation:
      "The published deadline governs. An extension or remedy may exist where the rules authorise it, especially for a confirmed platform-wide failure.",
    ruleIds: ["12.3", "12.4", "12.5"],
    phrases: ["miss deadline", "late entry", "deadline passed", "extension"],
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findGovernanceQuickAnswer(query: string) {
  const normalized = normalize(query);
  if (!normalized) return null;
  let best: { answer: GovernanceQuickAnswer; score: number } | null = null;
  for (const answer of GOVERNANCE_QUICK_ANSWERS) {
    const candidates = [answer.question, ...answer.phrases].map(normalize);
    let score = 0;
    for (const candidate of candidates) {
      if (candidate === normalized) score = Math.max(score, 100);
      else if (candidate.includes(normalized) || normalized.includes(candidate)) score = Math.max(score, 70);
      else {
        const words = normalized.split(" ").filter(Boolean);
        const overlap = words.filter((word) => candidate.includes(word)).length;
        score = Math.max(score, overlap * 10);
      }
    }
    if (!best || score > best.score) best = { answer, score };
  }
  return best && best.score >= 20 ? best.answer : null;
}

export const RULE_CHAPTER_GROUPS = [
  { title: "Foundation", chapters: [1, 2, 3] },
  { title: "Participation", chapters: [4, 5, 6] },
  { title: "Contest", chapters: [7, 8] },
  { title: "Voting", chapters: [9, 10, 11] },
  { title: "Operations", chapters: [12, 13, 15, 19, 20] },
  { title: "Safety & integrity", chapters: [14, 16, 17, 18] },
  { title: "Governance", chapters: [21] },
] as const;

export const PARTICIPANT_RULE_JOURNEY = [
  { step: "01", title: "Confirm", description: "Secure participation through the published confirmation process.", ruleIds: ["4.6", "4.7", "20.1"] },
  { step: "02", title: "Select your entry", description: "Check artist, song, popularity and reuse eligibility.", ruleIds: ["6.2", "6.4", "6.5", "6.6"] },
  { step: "03", title: "Submit", description: "Complete the official entry task before the published deadline.", ruleIds: ["6.3", "6.10", "12.3"] },
  { step: "04", title: "Compete", description: "Follow the published show format and presentation rules.", ruleIds: ["7.1", "7.2"] },
  { step: "05", title: "Vote", description: "Cast official votes independently through the designated systems.", ruleIds: ["9.2", "10.1", "11.2", "11.4"] },
  { step: "06", title: "Results", description: "Verified votes become the official published result.", ruleIds: ["7.3", "7.4", "7.6"] },
  { step: "07", title: "Host", description: "The winner receives the next edition's creative online hosting rights.", ruleIds: ["8.1", "8.2"] },
] as const;


export function governanceActionForPath(pathname: string): GovernanceActionKey | null {
  if (!pathname) return null;
  if (pathname.startsWith("/confirmations")) return "confirmation.submit";
  if (pathname.startsWith("/jury-voting")) return "jury.vote";
  if (pathname.startsWith("/televoting")) return "televote.vote";
  if (
    pathname.startsWith("/my-solaris/entry") ||
    pathname.startsWith("/participate/entry") ||
    pathname.startsWith("/admin/entries")
  ) return "entry.submit";
  if (pathname.startsWith("/integrity/appeal") || pathname.startsWith("/integrity/appeals")) return "integrity.appeal";
  if (pathname.startsWith("/integrity/preclearance")) return "integrity.guidance";
  if (pathname.startsWith("/integrity")) return "integrity.report";
  if (pathname.startsWith("/admin/design") || pathname.startsWith("/admin/edition-theme")) return "hosting.accept";
  return null;
}


export type GovernanceImpact = {
  action: GovernanceActionKey;
  title: string;
  changedRuleIds: string[];
};

export function governanceImpactForRuleIds(ruleIds: readonly string[]): GovernanceImpact[] {
  const changed = new Set(ruleIds);
  return GOVERNANCE_ACTION_KEYS.flatMap((action) => {
    const affected = governanceRules(action)
      .map((rule) => rule.id)
      .filter((id) => changed.has(id));
    if (!affected.length) return [];
    return [{
      action,
      title: governanceDefinition(action).title,
      changedRuleIds: affected,
    }];
  });
}


export type GovernanceReceiptSnapshot = {
  action: GovernanceActionKey;
  rulebookVersion: string;
  ruleIds: string[];
  capturedAt: string;
};

export function captureGovernanceSnapshot(
  action: GovernanceActionKey,
): GovernanceReceiptSnapshot {
  return {
    action,
    rulebookVersion: SSC_RULEBOOK.version,
    ruleIds: governanceRules(action).map((rule) => rule.id),
    capturedAt: new Date().toISOString(),
  };
}

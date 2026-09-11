import type { RuleInterpretation } from "@/lib/rule-interpretations";
import { searchSscRules } from "@/lib/ssc-rules-v4";

export type GovernanceLibraryGroup = "Rules & governance" | "Trust & Integrity";
export type GovernanceLibraryKind = "destination" | "rule" | "interpretation";

export type GovernanceLibraryResult = {
  id: string;
  kind: GovernanceLibraryKind;
  group: GovernanceLibraryGroup;
  title: string;
  description: string;
  to: string;
  badge?: string;
  keywords: string[];
};

export const GOVERNANCE_LIBRARY_DESTINATIONS: GovernanceLibraryResult[] = [
  {
    id: "governance-rules",
    kind: "destination",
    group: "Rules & governance",
    title: "Official SSC Rules",
    description: "Explore the complete 21-chapter Solaris Song Contest General Regulations.",
    to: "/rules",
    badge: "Rulebook",
    keywords: [
      "rules",
      "rulebook",
      "regulations",
      "ssc rules",
      "contest rules",
      "general regulations",
      "rule map",
    ],
  },
  {
    id: "governance-interpretations",
    kind: "destination",
    group: "Rules & governance",
    title: "Official Interpretations",
    description: "Published TSBC rulings explaining how existing SSC rules apply to recurring or unusual situations.",
    to: "/rules/interpretations",
    badge: "Rulings",
    keywords: [
      "interpretation",
      "interpretations",
      "ruling",
      "rulings",
      "guidance",
      "precedent",
      "clarification",
      "what does rule mean",
    ],
  },
  {
    id: "governance-changes",
    kind: "destination",
    group: "Rules & governance",
    title: "Rulebook Changes",
    description: "See published rulebook versions, effective dates and rule-by-rule change reasons.",
    to: "/rules/changes",
    badge: "History",
    keywords: [
      "rule changes",
      "rulebook changes",
      "history",
      "versions",
      "amendment",
      "amendments",
      "effective date",
      "old rules",
    ],
  },
  {
    id: "integrity-centre",
    kind: "destination",
    group: "Trust & Integrity",
    title: "Trust & Integrity",
    description: "Report a concern, ask TSBC privately, self-report an issue or return to a protected case.",
    to: "/integrity",
    badge: "Integrity",
    keywords: [
      "integrity",
      "report",
      "report concern",
      "anonymous report",
      "sealed identity",
      "confidential report",
      "safety",
      "harassment",
      "doxxing",
      "self report",
      "private question",
      "ask tsbc",
    ],
  },
  {
    id: "integrity-appeals",
    kind: "destination",
    group: "Trust & Integrity",
    title: "Appeals & Decisions",
    description: "Review protected-case decisions and submit an eligible appeal within the SSC appeal process.",
    to: "/integrity/appeals",
    badge: "Appeals",
    keywords: [
      "appeal",
      "appeals",
      "sanction appeal",
      "decision",
      "48 hours",
      "review sanction",
      "challenge decision",
    ],
  },
];

const NORMALIZED_ALIAS_TERMS: Record<string, string[]> = {
  esc: ["eurovision"],
  ns: ["national selection"],
  fv: ["friend voting", "voting integrity"],
  dq: ["disqualification", "sanction"],
  alt: ["alternate account", "multiple accounts"],
  alts: ["alternate account", "multiple accounts"],
  spotify: ["artist popularity", "monthly listeners"],
  views: ["youtube", "music video", "artist popularity"],
  permission: ["artist reuse", "representation rights"],
  ban: ["sanction", "suspension", "lifetime ban"],
  bot: ["automation", "confirmation", "technical abuse"],
  ai: ["artificial intelligence"],
  host: ["hosting", "creative hosting"],
  anonymous: ["anonymous report", "trust integrity"],
};

function normalize(value: string) {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

function queryTerms(query: string) {
  const normalized = normalize(query);
  if (!normalized) return [];
  const words = normalized.split(" ").filter(Boolean);
  const expanded = new Set([normalized, ...words]);
  for (const word of words) {
    for (const alias of NORMALIZED_ALIAS_TERMS[word] ?? []) expanded.add(alias);
  }
  return [...expanded];
}

function scoreText(result: GovernanceLibraryResult, terms: string[]) {
  const title = normalize(result.title);
  const searchable = normalize(
    [result.title, result.description, result.badge ?? "", ...result.keywords].join(" "),
  );
  let score = 0;
  for (const term of terms) {
    if (title === term) score += 18;
    else if (title.includes(term)) score += 9;
    if (searchable.includes(term)) score += term.includes(" ") ? 5 : 3;
  }
  return score;
}

function interpretationResult(interpretation: RuleInterpretation): GovernanceLibraryResult {
  return {
    id: `interpretation-${interpretation.id}`,
    kind: "interpretation",
    group: "Rules & governance",
    title: `${interpretation.code} · ${interpretation.title}`,
    description: interpretation.interpretation,
    to: "/rules/interpretations",
    badge: "Interpretation",
    keywords: [
      interpretation.code,
      interpretation.question,
      interpretation.rationale,
      ...interpretation.rule_ids.map((ruleId) => `rule ${ruleId}`),
    ],
  };
}

export function searchGovernanceLibrary(
  query: string,
  interpretations: RuleInterpretation[] = [],
): GovernanceLibraryResult[] {
  const normalized = normalize(query);

  if (!normalized) return [...GOVERNANCE_LIBRARY_DESTINATIONS];

  const terms = queryTerms(query);
  const destinationMatches = GOVERNANCE_LIBRARY_DESTINATIONS
    .map((result) => ({ result, score: scoreText(result, terms) }))
    .filter(({ score }) => score > 0);

  const ruleMatches = searchSscRules(query).slice(0, 10).map((rule, index) => ({
    score: Math.max(2, 14 - index),
    result: {
      id: `rule-${rule.id}`,
      kind: "rule" as const,
      group: "Rules & governance" as const,
      title: `Rule ${rule.id} · ${rule.title}`,
      description: rule.summary,
      to: `/rules/${rule.id}`,
      badge: `Rule ${rule.id}`,
      keywords: [rule.id, rule.title, ...rule.tags],
    },
  }));

  const interpretationMatches = interpretations
    .filter((item) => item.status === "published")
    .map(interpretationResult)
    .map((result) => ({ result, score: scoreText(result, terms) }))
    .filter(({ score }) => score > 0);

  const combined = [...destinationMatches, ...ruleMatches, ...interpretationMatches]
    .sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title))
    .map(({ result }) => result);

  const seen = new Set<string>();
  return combined.filter((result) => {
    if (seen.has(result.id)) return false;
    seen.add(result.id);
    return true;
  });
}

export function governanceLibraryGroups(results: GovernanceLibraryResult[]) {
  return (["Rules & governance", "Trust & Integrity"] as GovernanceLibraryGroup[])
    .map((group) => ({ group, results: results.filter((result) => result.group === group) }))
    .filter(({ results }) => results.length > 0);
}

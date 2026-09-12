export type RuleContextKey =
  | "confirmations"
  | "televoting"
  | "voting-integrity"
  | "jury"
  | "integrity"
  | "entries"
  | "hosting-media";

export type SharedRuleContext = {
  key: RuleContextKey;
  title: string;
  intro: string;
  ruleIds: string[];
  /** Canonical route-family path safe to expose in a public Library URL. */
  sourcePath: string;
};

type RuleContextDefinition = SharedRuleContext & {
  matches: (pathname: string) => boolean;
};

const DEFINITIONS: RuleContextDefinition[] = [
  {
    key: "confirmations",
    title: "Confirmation rules",
    intro: "The rules that decide opening time, server order, automation and what information must be supplied immediately.",
    ruleIds: ["4.3", "4.4", "4.6", "4.7", "12.1", "12.2", "20.1"],
    sourcePath: "/confirmations",
    matches: (pathname) => pathname.startsWith("/confirmations"),
  },
  {
    key: "televoting",
    title: "Televoting rules",
    intro: "Official-system voting, duplicate or invalid votes, independence and integrity review.",
    ruleIds: ["10.1", "11.1", "11.2", "11.4", "11.5", "11.7"],
    sourcePath: "/televoting",
    matches: (pathname) => pathname.startsWith("/televoting"),
  },
  {
    key: "voting-integrity",
    title: "Voting-integrity rules",
    intro: "Friendships are allowed. Coordination is not. Statistical and automated signals only decide what deserves human review.",
    ruleIds: ["11.2", "11.3", "11.4", "11.5", "11.6", "11.7", "16.5", "16.6"],
    sourcePath: "/admin/friend-voting",
    matches: (pathname) => pathname.startsWith("/admin/friend-voting") || pathname.startsWith("/admin/jury-integrity"),
  },
  {
    key: "jury",
    title: "Jury rules",
    intro: "How jury rankings stay independent and how integrity concerns are reviewed without treating a flag as guilt.",
    ruleIds: ["9.1", "9.2", "11.2", "11.4", "11.5", "11.7"],
    sourcePath: "/jury-voting",
    matches: (pathname) => pathname.startsWith("/jury-voting") || pathname.startsWith("/admin/jury"),
  },
  {
    key: "integrity",
    title: "Investigation rules",
    intro: "Protected reporting, evidence handling, findings, sanctions, appeals and conflicts of interest.",
    ruleIds: ["16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "17.1", "17.7", "18.1", "18.3"],
    sourcePath: "/integrity",
    matches: (pathname) => pathname.startsWith("/integrity") || pathname.startsWith("/admin/integrity"),
  },
  {
    key: "entries",
    title: "Entry rules",
    intro: "Song and artist eligibility, objective popularity checks, reuse history and official verification.",
    ruleIds: ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "6.10"],
    sourcePath: "/participate",
    matches: (pathname) => pathname.startsWith("/participate") || pathname.startsWith("/admin/entries") || pathname.startsWith("/admin/participant-status"),
  },
  {
    key: "hosting-media",
    title: "Hosting & media rules",
    intro: "Creative hosting rights, TSBC operational authority, third-party rights, branding and AI-assisted production.",
    ruleIds: ["8.1", "8.2", "8.4", "13.1", "13.2", "13.3", "13.5"],
    sourcePath: "/admin/design",
    matches: (pathname) => pathname.startsWith("/admin/design") || pathname.startsWith("/admin/edition-theme"),
  },
];

export function getRuleContext(pathname: string): SharedRuleContext | null {
  if (!pathname || pathname.startsWith("/rules") || pathname.startsWith("/library")) return null;
  const found = DEFINITIONS.find((definition) => definition.matches(pathname));
  if (!found) return null;
  const { matches: _matches, ...context } = found;
  return context;
}

export const RULE_CONTEXT_PATHS = DEFINITIONS.map((definition) => definition.sourcePath) as readonly string[];

/**
 * Accept only the deliberately coarse route-family values that we publish.
 * Case IDs, user IDs, evidence IDs and arbitrary query-string content never
 * become part of a Library context URL.
 */
export function sanitizeRuleContextPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return RULE_CONTEXT_PATHS.includes(value) ? value : undefined;
}

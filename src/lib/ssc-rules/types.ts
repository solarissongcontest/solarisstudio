export type RuleTone =
  | "allowed"
  | "prohibited"
  | "conditional"
  | "integrity"
  | "administrative"
  | "information";

export type RuleExample = {
  title: string;
  outcome: "allowed" | "not-allowed" | "depends" | "information";
  detail: string;
};

export type SscRule = {
  id: string;
  title: string;
  summary: string;
  tone: RuleTone;
  body: string[];
  bullets?: string[];
  allowed?: string[];
  prohibited?: string[];
  important?: string;
  examples?: RuleExample[];
  tags: string[];
  relatedRules?: string[];
};

export type SscRuleChapter = {
  number: number;
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  icon: string;
  accent: "sky" | "violet" | "emerald" | "amber" | "rose" | "cyan" | "indigo";
  atAGlance: string[];
  rules: SscRule[];
};

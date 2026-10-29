import {
  CANONICAL_LEGACY_RULE_ALIASES,
  CANONICAL_RULE_CHAPTERS,
} from "@/lib/ssc-rules/canon-v4.generated";

export const SSC_RULE_CHAPTERS = CANONICAL_RULE_CHAPTERS;

const legacyToCurrent = new Map(Object.entries(CANONICAL_LEGACY_RULE_ALIASES));

export const SSC_RULES = SSC_RULE_CHAPTERS.flatMap((chapter) =>
  chapter.rules.map((rule) => ({
    ...rule,
    relatedRules: rule.relatedRules?.map((id) => legacyToCurrent.get(id) ?? id),
    chapterNumber: chapter.number,
    chapterTitle: chapter.title,
    chapterSlug: chapter.slug,
  })),
);

export const LEGACY_RULE_ALIASES = CANONICAL_LEGACY_RULE_ALIASES;

export const SSC_RULEBOOK = {
  title: "Solaris Song Contest General Regulations",
  version: "4.0",
  status: "Online-first 21-chapter edition",
  publisher: "Terra Solaris Broadcasting Coalition (TSBC)",
  description:
    "The permanent General Regulations for the completely online, fan-organised Solaris Song Contest. Edition-Specific Regulations publish the variables that change from one edition to another.",
} as const;

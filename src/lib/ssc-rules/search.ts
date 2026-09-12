import { LEGACY_RULE_ALIASES, SEARCH_SYNONYMS } from "@/lib/ssc-rules/aliases";
import { SSC_RULES, SSC_RULE_CHAPTERS } from "@/lib/ssc-rules/canon-v4";

const rulesById = new Map(SSC_RULES.map((rule) => [rule.id, rule]));
const normalize = (value: string) => value.trim().toLowerCase();

export function getRuleById(id: string) {
  const normalized = id.trim();
  return rulesById.get(normalized) ?? rulesById.get(LEGACY_RULE_ALIASES[normalized] ?? "") ?? null;
}

export function getCurrentRuleId(id: string) {
  const normalized = id.trim();
  return rulesById.has(normalized) ? normalized : LEGACY_RULE_ALIASES[normalized] ?? null;
}

export function getChapterBySlug(slug: string) {
  return SSC_RULE_CHAPTERS.find((chapter) => chapter.slug === slug) ?? null;
}

export function searchSscRules(query: string) {
  const normalized = normalize(query);
  if (!normalized) return SSC_RULES;

  const words = normalized.split(/\s+/).filter(Boolean);
  const expanded = new Set(words);
  for (const word of words) {
    for (const synonym of SEARCH_SYNONYMS[word] ?? []) expanded.add(synonym);
  }

  return SSC_RULES.map((rule) => {
    const legacyIds = Object.entries(LEGACY_RULE_ALIASES)
      .filter(([, current]) => current === rule.id)
      .map(([legacy]) => legacy)
      .join(" ");
    const haystack = normalize([
      rule.id,
      legacyIds,
      rule.title,
      rule.summary,
      rule.chapterTitle,
      rule.tags.join(" "),
      rule.body.join(" "),
      (rule.bullets ?? []).join(" "),
      (rule.allowed ?? []).join(" "),
      (rule.prohibited ?? []).join(" "),
      (rule.examples ?? []).map((example) => `${example.title} ${example.detail}`).join(" "),
    ].join(" "));

    let score = haystack.includes(normalized) ? 12 : 0;
    for (const term of expanded) {
      if (haystack.includes(term)) score += term.includes(" ") ? 4 : 2;
      if (normalize(rule.title).includes(term)) score += 4;
      if (rule.tags.some((tag) => normalize(tag).includes(term))) score += 3;
    }
    return { rule, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id, undefined, { numeric: true }))
    .map(({ rule }) => rule);
}

export const QUICK_RULE_IDS = ["6.4", "6.5", "6.6", "11.2", "11.5", "4.6", "17.2", "17.7", "16.3", "20.1"] as const;
export const QUICK_RULES = QUICK_RULE_IDS.map(getRuleById).filter(Boolean) as NonNullable<ReturnType<typeof getRuleById>>[];
export const RULEBOOK_STATS = { chapters: SSC_RULE_CHAPTERS.length, rules: SSC_RULES.length };

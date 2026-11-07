import { SSC_RULES } from "@/lib/ssc-rules/current";
import { withPlainLanguage } from "@/lib/ssc-rules/plain-language-v42";
import { buildRuleSnapshot, type RulebookChange, type RuleSnapshot } from "@/lib/ssc-rules/runtime-overlay";

/**
 * A bounded, human-triggered Rules Manager import. It does not mutate the database
 * or mark a draft effective. Official releases must pass the existing approval/
 * publication path and retain before/after rule snapshots.
 */
export function buildV42GovernedDraftChanges(): RulebookChange[] {
  if (SSC_RULES.length !== 113) throw new Error("v4.2 import requires exactly 113 existing rules");

  const result: RulebookChange[] = SSC_RULES.map((rule) => {
    const before = buildRuleSnapshot(rule.id);
    if (!before) throw new Error(`Cannot prepare unknown SSC Rule ${rule.id}`);
    const revised = withPlainLanguage(rule);
    const after: RuleSnapshot = {
      id: revised.id,
      title: revised.title,
      summary: revised.summary,
      tone: revised.tone,
      body: [...revised.body],
      bullets: revised.bullets ? [...revised.bullets] : null,
      allowed: revised.allowed ? [...revised.allowed] : null,
      prohibited: revised.prohibited ? [...revised.prohibited] : null,
      important: revised.important ?? null,
      examples: revised.examples ? revised.examples.map((example) => ({ ...example })) : null,
      tags: [...revised.tags],
      relatedRules: revised.relatedRules ? [...revised.relatedRules] : null,
    };
    return {
      rule_id: rule.id,
      change_kind: "modified",
      before_snapshot: before,
      after_snapshot: after,
      rationale: "Plain-English clarification and organizer-reviewed SSC v4.2 policy decisions.",
    };
  });

  if (new Set(result.map((change) => change.rule_id)).size !== 113) {
    throw new Error("v4.2 import contains duplicate rule IDs");
  }
  return result;
}

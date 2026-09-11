import { ContextualRuleGuide } from "@/components/rules/ContextualRuleGuide";
import { usePublishedRulebook } from "@/lib/rules-governance";

/**
 * Keeps the published rulebook overlay active globally and surfaces contextual
 * rule help only where a workflow has relevant regulations.
 *
 * Rules, interpretations, rulebook history and Trust & Integrity are discovered
 * through the shared Library/Search experience instead of a permanently
 * visible floating shortcut.
 */
export function GlobalRulesNavigationAddon() {
  usePublishedRulebook();
  return <ContextualRuleGuide />;
}

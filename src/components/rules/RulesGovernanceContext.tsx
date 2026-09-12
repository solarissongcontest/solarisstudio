import { usePublishedRulebook } from "@/lib/rules-governance";

/**
 * Keeps the active published rulebook overlay available to Rules consumers.
 * This runtime provider deliberately renders no launcher, drawer or document
 * injection. Public discovery belongs to the Library and workflow-local links.
 */
export function RulesGovernanceContext() {
  usePublishedRulebook();
  return null;
}

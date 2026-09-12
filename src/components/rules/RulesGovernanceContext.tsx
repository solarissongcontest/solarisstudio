import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { getRuleContext, sanitizeRuleContextPath } from "@/lib/rule-context";
import { usePublishedRulebook } from "@/lib/rules-governance";

const RULE_CONTEXT_STORAGE_KEY = "solaris:rule-context-path";

/**
 * Keeps the active published rulebook overlay available to Rules consumers and
 * remembers only the deliberately coarse workflow-family path used by the
 * public Library. No case IDs, evidence IDs, query strings or reporter details
 * are persisted into the navigation handoff.
 *
 * This runtime provider deliberately renders no launcher, drawer or document
 * injection. Public discovery belongs to the Library and workflow-local links.
 */
export function RulesGovernanceContext() {
  usePublishedRulebook();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.searchStr });
  const navigate = useNavigate();

  useEffect(() => {
    const context = getRuleContext(pathname);
    if (context) {
      window.sessionStorage.setItem(RULE_CONTEXT_STORAGE_KEY, context.sourcePath);
      return;
    }

    if (pathname !== "/library" || search.includes("from=")) return;

    const stored = sanitizeRuleContextPath(window.sessionStorage.getItem(RULE_CONTEXT_STORAGE_KEY));
    if (!stored) return;

    void navigate({
      to: "/library",
      search: { from: stored },
      replace: true,
    });
  }, [navigate, pathname, search]);

  return null;
}

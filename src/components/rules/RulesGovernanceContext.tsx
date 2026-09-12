import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { getRuleContext } from "@/lib/rule-context";
import { usePublishedRulebook } from "@/lib/rules-governance";

export const RULE_CONTEXT_STORAGE_KEY = "solaris:rule-context-path";

/**
 * Keeps the active published rulebook overlay available to Rules consumers and
 * remembers only the deliberately coarse workflow-family path used by the
 * public Library. No case IDs, evidence IDs, query strings or reporter details
 * are persisted into the navigation handoff.
 *
 * The Library consumes the stored context after its own first client render.
 * Keeping navigation out of this root provider avoids changing nested route
 * search state while React is still hydrating the page.
 */
export function RulesGovernanceContext() {
  usePublishedRulebook();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  useEffect(() => {
    const context = getRuleContext(pathname);
    if (!context) return;
    window.sessionStorage.setItem(RULE_CONTEXT_STORAGE_KEY, context.sourcePath);
  }, [pathname]);

  return null;
}

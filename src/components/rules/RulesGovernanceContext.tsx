import { useEffect } from "react";

import { governanceActionForPath } from "@/lib/governance-v5";
import { useHydrationSafeRouterLocation } from "@/lib/hydration-safe-router-location";
import { getRuleContext } from "@/lib/rule-context";
import { consumeRuleReturnRestore } from "@/lib/rule-return-context";
import { usePublishedRulebook } from "@/lib/rules-governance";

export const RULE_CONTEXT_STORAGE_KEY = "solaris:rule-context-path";
export const GOVERNANCE_ACTION_STORAGE_KEY = "solaris:governance-action";
const TERRAOS_TEASER_PREVIEW_PATH = "/terraos-teaser-preview";

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
  const { pathname } = useHydrationSafeRouterLocation();

  // The maintenance teaser preview is a fixture renderer. It deliberately uses
  // real V3 components, but it must not turn their shared root environment into
  // a live Supabase reader. Keep the published-rulebook query out of this route.
  if (pathname === TERRAOS_TEASER_PREVIEW_PATH) return null;

  return <ActiveRulesGovernanceContext />;
}

function ActiveRulesGovernanceContext() {
  usePublishedRulebook();
  const { pathname, searchStr } = useHydrationSafeRouterLocation();

  useEffect(() => {
    const context = getRuleContext(pathname);
    if (context) window.sessionStorage.setItem(RULE_CONTEXT_STORAGE_KEY, context.sourcePath);

    const governanceAction = governanceActionForPath(pathname);
    if (governanceAction) {
      window.sessionStorage.setItem(GOVERNANCE_ACTION_STORAGE_KEY, governanceAction);
    }

    const restore = consumeRuleReturnRestore(pathname, searchStr);
    if (!restore) return;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: restore.scrollY, behavior: "auto" });
        if (restore.focusId) {
          const target = document.getElementById(restore.focusId);
          if (target instanceof HTMLElement) target.focus({ preventScroll: true });
        }
      });
    });
  }, [pathname, searchStr]);

  return null;
}

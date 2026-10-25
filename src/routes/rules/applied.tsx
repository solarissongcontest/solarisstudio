import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { RulesApplyingHere } from "@/components/rules/GovernanceRules";
import {
  GOVERNANCE_ACTION_STORAGE_KEY,
  RULE_CONTEXT_STORAGE_KEY,
} from "@/components/rules/RulesGovernanceContext";
import { V3RulesRouteGate } from "@/components/v3/V3RulesRouteGate";
import type { GovernanceActionKey } from "@/lib/governance-v5";
import { sanitizeRuleContextPath } from "@/lib/rule-context";
import { resolveAppliedRulesContext } from "@/lib/v3-rules-applied-context";

type AppliedRulesSearch = {
  /** undefined = no nomination, null = explicit invalid nomination */
  context?: string | null;
};

export const Route = createFileRoute("/rules/applied")({
  validateSearch: (search: Record<string, unknown>): AppliedRulesSearch => ({
    context: Object.prototype.hasOwnProperty.call(search, "context")
      ? (sanitizeRuleContextPath(search.context) ?? null)
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Rules Applying Here — Solaris Song Contest" },
      { name: "description", content: "See the exact official rules attached to the Solaris task you were using." },
    ],
  }),
  component: AppliedRulesPage,
});

export function AppliedRulesPage() {
  const { context: contextPath } = Route.useSearch();
  const contextRequested = contextPath !== undefined;
  const content = (
    <AppliedRulesContent
      key={contextRequested ? `explicit:${contextPath ?? "invalid"}` : "session-context"}
      contextPath={contextPath}
    />
  );

  return (
    <V3RulesRouteGate
      phaseLabel="Rule guidance"
      resolvingTitle="Opening rule guidance"
      legacy={<AppShell>{content}</AppShell>}
    >
      {content}
    </V3RulesRouteGate>
  );
}

function AppliedRulesContent({ contextPath }: { contextPath?: string | null }) {
  const contextRequested = contextPath !== undefined;
  const explicitResolution = contextRequested
    ? resolveAppliedRulesContext({ explicitContextPath: contextPath ?? "" })
    : null;
  const [sessionResolution, setSessionResolution] = useState<{
    ready: boolean;
    context: GovernanceActionKey | null;
  }>({ ready: false, context: null });

  useEffect(() => {
    if (contextRequested) return;

    try {
      const resolution = resolveAppliedRulesContext({
        storedAction: window.sessionStorage.getItem(GOVERNANCE_ACTION_STORAGE_KEY),
        storedContextPath: window.sessionStorage.getItem(RULE_CONTEXT_STORAGE_KEY),
      });
      setSessionResolution({ ready: true, context: resolution.context });
    } catch {
      setSessionResolution({ ready: true, context: null });
    }
  }, [contextRequested]);

  const resolving = !contextRequested && !sessionResolution.ready;
  const context = explicitResolution?.context ?? sessionResolution.context;

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <header className="border-b border-border/65 pb-5">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">Applied rules</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Rules for your current Solaris task</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Solaris remembers only the coarse workflow family, never ballot contents, case IDs or other sensitive task details.
        </p>
      </header>
      {resolving ? (
        <div className="mt-6 border-y border-border/60 py-6" aria-live="polite">
          <p className="text-sm text-muted-foreground">Resolving the rule guidance for this session…</p>
        </div>
      ) : context ? (
        <RulesApplyingHere context={context} initiallyExpanded primaryLimit={99} className="mt-5" />
      ) : (
        <div className="mt-6 border-y border-border/60 py-6">
          <p className="text-sm text-muted-foreground">
            {contextRequested
              ? "No rule-aware workflow matches this context."
              : "No recent rule-aware task is available in this session."}
          </p>
          <Link to="/rules" className="mt-3 inline-flex text-sm font-bold text-primary">Open Rules</Link>
        </div>
      )}
    </div>
  );
}

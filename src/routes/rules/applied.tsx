import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { RulesApplyingHere } from "@/components/rules/GovernanceRules";
import { RULE_CONTEXT_STORAGE_KEY } from "@/components/rules/RulesGovernanceContext";
import type { GovernanceActionKey } from "@/lib/governance-v5";
import { getRuleContext } from "@/lib/rule-context";

export const Route = createFileRoute("/rules/applied")({
  head: () => ({
    meta: [
      { title: "Rules Applying Here — Solaris Song Contest" },
      { name: "description", content: "See the exact official rules attached to the Solaris task you were using." },
    ],
  }),
  component: AppliedRulesPage,
});

function actionFor(path: string | null): GovernanceActionKey | null {
  if (!path) return null;
  const context = getRuleContext(path);
  if (!context) return null;
  if (context.key === "confirmations") return "confirmation.submit";
  if (context.key === "jury") return "jury.vote";
  if (context.key === "televoting") return "televote.vote";
  if (context.key === "entries") return "entry.submit";
  if (context.key === "integrity") return "integrity.report";
  if (context.key === "hosting-media") return "hosting.accept";
  return null;
}

export function AppliedRulesPage() {
  const [context, setContext] = useState<GovernanceActionKey | null>(null);

  useEffect(() => {
    try {
      setContext(actionFor(window.sessionStorage.getItem(RULE_CONTEXT_STORAGE_KEY)));
    } catch {
      setContext(null);
    }
  }, []);

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">Applied rules</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Rules for your current Solaris task</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Solaris remembers only the coarse workflow family, never ballot contents, case IDs or other sensitive task details.
          </p>
        </header>
        {context ? (
          <RulesApplyingHere context={context} initiallyExpanded primaryLimit={99} className="mt-5" />
        ) : (
          <div className="mt-6 border-y border-border/60 py-6">
            <p className="text-sm text-muted-foreground">No recent rule-aware task is available in this session.</p>
            <Link to="/rules" className="mt-3 inline-flex text-sm font-bold text-primary">Open Rules</Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}

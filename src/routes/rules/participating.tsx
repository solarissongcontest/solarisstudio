import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { PARTICIPANT_RULE_JOURNEY } from "@/lib/governance-v5";
import { getRuleById } from "@/lib/ssc-rules-v4";

export const Route = createFileRoute("/rules/participating")({
  head: () => ({
    meta: [
      { title: "Rules for Participating — Solaris Song Contest" },
      { name: "description", content: "Follow the official SSC rules from confirmation through entry, voting, results and hosting." },
    ],
  }),
  component: ParticipatingRulesPage,
});

function ParticipatingRulesPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">Rules</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Your SSC journey</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            The rules that matter as a delegation moves from confirmation to hosting.
          </p>
        </header>

        <ol className="mt-6">
          {PARTICIPANT_RULE_JOURNEY.map((stage, index) => (
            <li key={stage.step} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 pb-7">
              {index < PARTICIPANT_RULE_JOURNEY.length - 1 ? (
                <span className="absolute bottom-0 left-[1.2rem] top-9 w-px bg-border" />
              ) : null}
              <span className="z-10 grid size-10 place-items-center rounded-full border border-primary/20 bg-background font-mono text-xs font-black text-primary">
                {stage.step}
              </span>
              <div className="pt-1">
                <h2 className="text-lg font-bold">{stage.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{stage.description}</p>
                <div className="mt-3 space-y-1">
                  {stage.ruleIds.map((ruleId) => {
                    const rule = getRuleById(ruleId);
                    if (!rule) return null;
                    return (
                      <Link
                        key={rule.id}
                        to="/rules/$ruleId"
                        params={{ ruleId: rule.id }}
                        className="flex min-h-10 items-center justify-between gap-3 border-t border-border/50 py-2 text-sm"
                      >
                        <span><span className="font-mono text-xs font-bold text-primary">{rule.id}</span> · {rule.title}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </AppShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import { GOVERNANCE_QUICK_ANSWERS } from "@/lib/governance-v5";

export const Route = createFileRoute("/rules/answers")({
  head: () => ({
    meta: [
      { title: "Quick Rule Answers — Solaris Song Contest" },
      { name: "description", content: "Plain-language answers to common SSC rule questions with exact official rule references." },
    ],
  }),
  component: RuleAnswersPage,
});

function RuleAnswersPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">Rules</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Quick answers</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            The useful answer first, with the exact official rule one tap behind it.
          </p>
        </header>

        <div className="mt-4 divide-y divide-border/60 border-y border-border/60">
          {GOVERNANCE_QUICK_ANSWERS.map((answer) => (
            <article id={answer.id} key={answer.id} className="scroll-mt-24 py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-bold">{answer.question}</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{answer.explanation}</p>
                </div>
                <span className="shrink-0 text-xl font-black text-primary">{answer.answer}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {answer.ruleIds.map((ruleId) => (
                  <Link
                    key={ruleId}
                    to="/rules/$ruleId"
                    params={{ ruleId }}
                    className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-primary"
                  >
                    Rule {ruleId} <ArrowRight className="size-3.5" />
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { AppShell } from "@/components/AppShell";
import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
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
      <SolarisDepthPage tone="rules">
        <SolarisDepthSafeZone>
          <header>
            <SolarisDepthEyebrow tone="primary">Rules</SolarisDepthEyebrow>
            <h1 className="mt-2 text-2xl font-bold tracking-[-0.025em]">Quick answers</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Direct answers first, with the exact official rule immediately behind each one.
            </p>
            <GovernanceStatusStrip context="rules" className="mt-3" />
          </header>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-5">
          <SolarisDepthSurface variant="reading" className="!py-1">
            {GOVERNANCE_QUICK_ANSWERS.map((answer) => (
              <article id={answer.id} key={answer.id} className="scroll-mt-24 border-t border-white/[0.07] py-4 first:border-t-0">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold leading-5">{answer.question}</h2>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{answer.explanation}</p>
                  </div>
                  <span className="solaris-depth-verdict shrink-0">{answer.answer}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                  {answer.ruleIds.map((ruleId) => (
                    <Link
                      key={ruleId}
                      to="/rules/$ruleId"
                      params={{ ruleId }}
                      className="solaris-depth-rule-ref"
                    >
                      Rule {ruleId} <ArrowRight className="size-3" />
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </AppShell>
  );
}

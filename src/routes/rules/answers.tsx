import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, MessageCircleQuestion } from "lucide-react";

import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { GOVERNANCE_QUICK_ANSWERS } from "@/lib/governance-v5";
import { ROLEPLAY_QUICK_ANSWERS } from "@/lib/ssc-rules/roleplay";

const QUICK_ANSWERS = [...ROLEPLAY_QUICK_ANSWERS, ...GOVERNANCE_QUICK_ANSWERS];

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
    <RulesRouteShell resolvingTitle="Opening quick rule answers">
      <SolarisDepthPage tone="rules">
        <SolarisDepthSafeZone>
          <SolarisDepthSurface variant="action">
            <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <SolarisDepthEyebrow tone="primary">Rules</SolarisDepthEyebrow>
                <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Quick answers</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Direct answers first, with the exact official rule immediately behind each one. Worldbuilding questions now sit beside contest, integrity and eligibility questions.
                </p>
                <GovernanceStatusStrip context="rules" className="mt-3" />
              </div>
              <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3 text-xs text-muted-foreground">
                <MessageCircleQuestion className="size-4 text-primary" aria-hidden="true" />
                {QUICK_ANSWERS.length} common situations
              </span>
            </header>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-5">
          <div className="grid gap-3 md:grid-cols-2">
            {QUICK_ANSWERS.map((answer) => (
              <article
                id={answer.id}
                key={answer.id}
                className="scroll-mt-24 rounded-[1.25rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,.025),transparent_40%),rgba(7,18,42,.7)] p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold leading-5">{answer.question}</h2>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{answer.explanation}</p>
                  </div>
                  <span className="solaris-depth-verdict shrink-0">{answer.answer}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {answer.ruleIds.map((ruleId) => (
                    <Link
                      key={ruleId}
                      to="/rules/$ruleId"
                      params={{ ruleId }}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-primary/12 bg-primary/[0.045] px-2.5 font-mono text-[11px] font-bold text-primary transition hover:bg-primary/[0.09]"
                    >
                      Rule {ruleId} <ArrowRight className="size-3" />
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </RulesRouteShell>
  );
}

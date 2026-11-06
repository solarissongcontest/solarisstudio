import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Flag, Route as RouteIcon, Sparkles } from "lucide-react";

import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
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
    <RulesRouteShell resolvingTitle="Opening participation rules">
      <SolarisDepthPage tone="rules" className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SolarisDepthSafeZone>
          <SolarisDepthSurface variant="action">
            <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <SolarisDepthEyebrow tone="primary">Rules for participating</SolarisDepthEyebrow>
                <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Your SSC journey</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Follow the rules that matter as a delegation moves from confirmation through entry, voting, results and hosting.
                </p>
                <GovernanceStatusStrip context="rules" className="mt-3" />
              </div>
              <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3 text-xs text-muted-foreground">
                <RouteIcon className="size-4 text-primary" aria-hidden="true" />
                {PARTICIPANT_RULE_JOURNEY.length} stages
              </span>
            </header>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-5">
          <ol className="grid gap-3 md:grid-cols-2">
            {PARTICIPANT_RULE_JOURNEY.map((stage, index) => (
              <li
                key={stage.step}
                className="relative overflow-hidden rounded-[1.3rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,.03),transparent_42%),rgba(7,18,42,.72)] p-4 sm:p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-primary/18 bg-primary/[0.07] font-mono text-xs font-black text-primary">
                    {String(stage.step).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {index === 0 ? <Flag className="size-4 text-primary" aria-hidden="true" /> : <Sparkles className="size-4 text-primary/70" aria-hidden="true" />}
                      <h2 className="text-base font-bold">{stage.title}</h2>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{stage.description}</p>
                  </div>
                </div>

                <div className="mt-4 border-t border-white/[0.07] pt-2">
                  {stage.ruleIds.map((ruleId) => {
                    const rule = getRuleById(ruleId);
                    if (!rule) return null;
                    return (
                      <Link
                        key={rule.id}
                        to="/rules/$ruleId"
                        params={{ ruleId: rule.id }}
                        className="group flex min-h-11 items-center justify-between gap-3 rounded-lg px-1.5 py-2 text-sm transition hover:bg-white/[0.03]"
                      >
                        <span className="min-w-0">
                          <span className="font-mono text-[11px] font-bold text-primary">{rule.id}</span>
                          <span className="ml-1.5 line-clamp-1 font-medium">{rule.title}</span>
                        </span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                      </Link>
                    );
                  })}
                </div>
              </li>
            ))}
          </ol>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-5">
          <SolarisDepthSurface variant="quiet" className="flex items-start gap-3">
            <RouteIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="text-sm leading-6 text-muted-foreground">
              This journey is a navigation aid. It does not replace the complete General Regulations, and worldbuilding rules remain separately available in Chapter 22.
            </p>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </RulesRouteShell>
  );
}

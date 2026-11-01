import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, CircleHelp, ShieldCheck, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/rules/check")({
  head: () => ({
    meta: [
      { title: "Rule Checker — Solaris Song Contest" },
      { name: "description", content: "Use controlled decision tools for common SSC rule questions." },
    ],
  }),
  component: RuleCheckerPage,
});

type Answer = "yes" | "no" | "unknown" | null;

type CheckerResult = {
  status: string;
  tone: "rose" | "amber" | "emerald";
  rule: string;
  detail: string;
};

const RESULT_STYLES: Record<CheckerResult["tone"], string> = {
  rose: "border-rose-300/18 bg-rose-300/[0.05]",
  amber: "border-amber-300/18 bg-amber-300/[0.05]",
  emerald: "border-emerald-300/18 bg-emerald-300/[0.05]",
};

export function RuleCheckerPage() {
  const [eurovision, setEurovision] = useState<Answer>(null);
  const [popularity, setPopularity] = useState<Answer>(null);
  const [availability, setAvailability] = useState<Answer>(null);
  const answers = [eurovision, popularity, availability];
  const complete = answers.every(Boolean);
  const completedCount = answers.filter(Boolean).length;

  const result = useMemo<CheckerResult | null>(() => {
    if (!complete) return null;
    if (eurovision === "yes") return { status: "Likely not eligible", tone: "rose", rule: "6.5", detail: "The current Eurovision-history restriction appears to prevent this entry." };
    if (popularity === "yes") return { status: "Likely not eligible", tone: "rose", rule: "6.4", detail: "The information entered suggests the published popularity threshold is exceeded." };
    if (availability === "no") return { status: "Needs attention", tone: "amber", rule: "6.2", detail: "Required recording or presentation availability appears incomplete." };
    if (answers.includes("unknown")) return { status: "Needs official review", tone: "amber", rule: "6.1", detail: "At least one eligibility fact is uncertain, so Solaris does not manufacture a pass/fail answer." };
    return { status: "No issue found in these checks", tone: "emerald", rule: "6.1", detail: "These three checks do not reveal an obvious problem. Other entry requirements still apply." };
  }, [availability, complete, eurovision, popularity]);

  return (
    <RulesRouteShell resolvingTitle="Opening Rule checker">
      <SolarisDepthPage tone="rules" className="pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SolarisDepthSafeZone>
          <SolarisDepthSurface variant="action">
            <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <SolarisDepthEyebrow tone="primary">Rule checker</SolarisDepthEyebrow>
                <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Check an entry</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Apply a small set of objective eligibility checks. This is structured guidance, not an official TSBC eligibility decision.
                </p>
                <GovernanceStatusStrip context="rules" className="mt-3" />
              </div>
              <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                <span><strong className="text-foreground">{completedCount}/3</strong> answered</span>
              </div>
            </header>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-primary transition-[width] duration-200"
                style={{ width: `${(completedCount / 3) * 100}%` }}
              />
            </div>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-5">
          <div className="grid gap-3">
            <Question
              step="01"
              title="Has the artist competed in Eurovision under the current restriction?"
              value={eurovision}
              setValue={setEurovision}
            />
            <Question
              step="02"
              title="Does the entry exceed the current published popularity limit at the official check time?"
              value={popularity}
              setValue={setPopularity}
            />
            <Question
              step="03"
              title="Are the required recording and presentation media available?"
              value={availability}
              setValue={setAvailability}
            />
          </div>
        </SolarisDepthSafeZone>

        <SolarisDepthSafeZone className="mt-5">
          {result ? (
            <section
              className={cn("rounded-[1.35rem] border p-4 sm:p-5", RESULT_STYLES[result.tone])}
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-black/10 text-primary">
                  {result.tone === "emerald" ? <CheckCircle2 className="size-5" /> : <Sparkles className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <SolarisDepthEyebrow>Result</SolarisDepthEyebrow>
                  <h2 className="mt-1 text-xl font-bold">{result.status}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{result.detail}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Link
                  to="/rules/$ruleId"
                  params={{ ruleId: result.rule }}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
                >
                  Read Rule {result.rule}
                </Link>
                <Link
                  to="/integrity/preclearance"
                  search={{ rule: result.rule }}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/[0.09] bg-black/10 px-4 text-sm font-bold"
                >
                  Ask TSBC privately
                </Link>
              </div>
            </section>
          ) : (
            <SolarisDepthSurface variant="quiet" className="flex items-start gap-3">
              <CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm leading-6 text-muted-foreground">
                Answer all three questions to get a controlled result. “I’m not sure” deliberately leads to review instead of pretending uncertainty is a pass.
              </p>
            </SolarisDepthSurface>
          )}
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </RulesRouteShell>
  );
}

function Question({
  step,
  title,
  value,
  setValue,
}: {
  step: string;
  title: string;
  value: Answer;
  setValue: (value: Answer) => void;
}) {
  return (
    <fieldset className="rounded-[1.25rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,.025),transparent_45%),rgba(7,18,42,.7)] p-4 sm:p-5">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.06] font-mono text-[10px] font-black text-primary">
          {step}
        </span>
        <p className="pt-1 text-sm font-semibold leading-6 sm:text-base">{title}</p>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          ["yes", "Yes"],
          ["no", "No"],
          ["unknown", "I’m not sure"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => setValue(id as Answer)}
            className={cn(
              "min-h-12 rounded-xl border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
              value === id
                ? "border-primary/40 bg-primary/10 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.05)]"
                : "border-white/[0.08] bg-black/10 text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";

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

export function RuleCheckerPage() {
  const [eurovision, setEurovision] = useState<Answer>(null);
  const [popularity, setPopularity] = useState<Answer>(null);
  const [availability, setAvailability] = useState<Answer>(null);
  const complete = [eurovision, popularity, availability].every(Boolean);

  const result = useMemo(() => {
    if (!complete) return null;
    if (eurovision === "yes") return { status: "Likely not eligible", tone: "rose", rule: "6.5", detail: "The current Eurovision-history restriction appears to prevent this entry." };
    if (popularity === "yes") return { status: "Likely not eligible", tone: "rose", rule: "6.4", detail: "The information entered suggests the published popularity threshold is exceeded." };
    if (availability === "no") return { status: "Needs attention", tone: "amber", rule: "6.2", detail: "Required recording or presentation availability appears incomplete." };
    if ([eurovision, popularity, availability].includes("unknown")) return { status: "Needs official review", tone: "amber", rule: "6.1", detail: "At least one eligibility fact is uncertain, so Solaris should not manufacture a pass/fail answer." };
    return { status: "No issue found in these checks", tone: "emerald", rule: "6.1", detail: "These three checks do not reveal an obvious problem. Other entry requirements still apply." };
  }, [availability, complete, eurovision, popularity]);

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">Rule checker</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Check an entry</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            This tool applies a few objective entry checks. It is guidance, not an official TSBC eligibility decision.
          </p>
        </header>

        <div className="mt-6 space-y-7">
          <Question
            title="Has the artist competed in Eurovision under the current restriction?"
            value={eurovision}
            setValue={setEurovision}
          />
          <Question
            title="Does the entry exceed the current published popularity limit at the official check time?"
            value={popularity}
            setValue={setPopularity}
          />
          <Question
            title="Are the required recording and presentation media available?"
            value={availability}
            setValue={setAvailability}
            yesLabel="Yes"
            noLabel="No"
          />
        </div>

        {result ? (
          <section className="mt-8 border-t border-border/65 pt-5" aria-live="polite">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Result</p>
            <h2 className="mt-2 text-2xl font-black">{result.status}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{result.detail}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/rules/$ruleId"
                params={{ ruleId: result.rule }}
                className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"
              >
                Read Rule {result.rule}
              </Link>
              <Link
                to="/integrity/preclearance"
                search={{ rule: result.rule }}
                className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-bold"
              >
                Ask TSBC privately
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

function Question({
  title,
  value,
  setValue,
  yesLabel = "Yes",
  noLabel = "No",
}: {
  title: string;
  value: Answer;
  setValue: (value: Answer) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <fieldset>
      <legend className="text-base font-bold">{title}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {[
          ["yes", yesLabel],
          ["no", noLabel],
          ["unknown", "I'm not sure"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => setValue(id as Answer)}
            className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${value === id ? "border-primary/40 bg-primary/10 text-foreground" : "border-border bg-surface text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

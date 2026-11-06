import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, History, MessageCircleQuestion, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import {
  GovernanceDepthLayout,
  SolarisDepthEyebrow,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { getPublicRuleInterpretations } from "@/lib/rule-interpretations";

export const Route = createFileRoute("/rules/interpretations")({
  head: () => ({
    meta: [
      { title: "Official Clarifications — SSC Rules" },
      {
        name: "description",
        content:
          "Official TSBC clarifications explaining how existing Solaris Song Contest rules apply.",
      },
    ],
  }),
  component: InterpretationsIndex,
});

function InterpretationsIndex() {
  const [query, setQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const interpretations = useQuery({
    queryKey: ["public-rule-interpretations", "all"],
    queryFn: () => getPublicRuleInterpretations(null),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (interpretations.data ?? []).filter((item) => {
      if (!showHistory && item.status === "superseded") return false;
      if (!needle) return true;
      return [
        item.code,
        item.title,
        item.question,
        item.interpretation,
        item.rationale,
        ...item.rule_ids,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [interpretations.data, query, showHistory]);

  return (
    <RulesRouteShell phaseLabel="Official clarifications" resolvingTitle="Opening official clarifications">
      <GovernanceDepthLayout tone="rules" context="rules" className="mx-auto max-w-4xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <SolarisDepthSurface variant="action">
          <header className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div>
              <SolarisDepthEyebrow tone="primary">Rules</SolarisDepthEyebrow>
              <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
                Official clarifications
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Published TSBC answers explain how an existing rule applies. They do not silently replace the official regulation or create a new rulebook version.
              </p>
            </div>
            <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3 text-xs text-muted-foreground">
              <MessageCircleQuestion className="size-4 text-primary" aria-hidden="true" />
              {filtered.length} shown
            </span>
          </header>
        </SolarisDepthSurface>

        <section className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex min-h-12 flex-1 items-center gap-3 rounded-[1.2rem] border border-white/[0.09] bg-[rgba(5,19,41,.88)] px-3 shadow-[0_10px_30px_rgba(0,5,22,.16)] focus-within:border-primary/35">
            <Search className="size-4 shrink-0 text-primary" />
            <span className="sr-only">Search official clarifications</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clarifications"
              className="min-h-10 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            aria-pressed={showHistory}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/[0.09] bg-[rgba(5,19,41,.82)] px-4 text-xs font-bold transition hover:bg-white/[0.04]"
          >
            <History className="size-4 text-primary" />
            {showHistory ? "Hide superseded" : "Show superseded"}
          </button>
        </section>

        <section className="mt-5" aria-live="polite">
          {interpretations.isLoading ? (
            <SolarisDepthSurface variant="quiet">
              <p className="text-sm text-muted-foreground">Loading official clarifications…</p>
            </SolarisDepthSurface>
          ) : interpretations.isError ? (
            <div className="rounded-xl border border-rose-300/15 bg-rose-300/[0.045] p-4">
              <p className="text-sm font-semibold">Clarifications are temporarily unavailable.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The current official rulebook remains available.
              </p>
            </div>
          ) : filtered.length ? (
            <div className="grid gap-3">
              {filtered.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-[1.3rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,.025),transparent_42%),rgba(7,18,42,.72)] p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="grid size-8 place-items-center rounded-xl border border-primary/12 bg-primary/[0.055] text-primary">
                      <BadgeCheck className={item.status === "superseded" ? "size-4 opacity-55" : "size-4"} />
                    </span>
                    <span className="font-mono text-[11px] font-black text-primary">
                      {item.code}
                    </span>
                    <span className={item.status === "superseded" ? "rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] font-bold text-muted-foreground" : "rounded-full border border-emerald-300/15 bg-emerald-300/[0.05] px-2 py-0.5 text-[10px] font-bold text-emerald-200"}>
                      {item.status === "superseded"
                        ? "Superseded"
                        : item.effective_from
                          ? "Effective " + new Date(item.effective_from).toLocaleDateString()
                          : "Published"}
                    </span>
                  </div>

                  <h2 className="mt-3 text-lg font-bold">{item.title}</h2>

                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
                    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3.5">
                      <SolarisDepthEyebrow>Question</SolarisDepthEyebrow>
                      <p className="mt-2 text-sm leading-6">{item.question}</p>
                    </div>
                    <div className="rounded-xl border border-primary/12 bg-primary/[0.035] p-3.5">
                      <SolarisDepthEyebrow tone="primary">Official answer</SolarisDepthEyebrow>
                      <p className="mt-2 text-sm font-semibold leading-6 sm:text-base">{item.interpretation}</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <SolarisDepthEyebrow>Why</SolarisDepthEyebrow>
                    <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{item.rationale}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.rule_ids.map((ruleId) => (
                      <Link
                        key={ruleId}
                        to="/rules/$ruleId"
                        params={{ ruleId }}
                        className="inline-flex min-h-9 items-center rounded-lg border border-primary/12 bg-primary/[0.045] px-2.5 font-mono text-xs font-bold text-primary"
                      >
                        Rule {ruleId}
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <SolarisDepthSurface variant="quiet" className="text-center">
              <p className="text-sm font-semibold">No matching clarifications</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a broader rule or topic.</p>
            </SolarisDepthSurface>
          )}
        </section>
      </GovernanceDepthLayout>
    </RulesRouteShell>
  );
}

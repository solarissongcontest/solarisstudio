import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, History, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
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
    <AppShell>
      <div className="mx-auto max-w-4xl pb-20">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">
            Rules
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">
            Official clarifications
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            These explain how an existing rule applies. They do not silently replace the official regulation or create a new rulebook version.
          </p>
        </header>

        <section className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="flex min-h-12 flex-1 items-center gap-3 rounded-xl border border-border bg-surface/40 px-3">
            <Search className="size-4 shrink-0 text-primary" />
            <span className="sr-only">Search official clarifications</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clarifications"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowHistory((value) => !value)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface/40 px-4 text-xs font-bold"
          >
            <History className="size-4" />
            {showHistory ? "Hide superseded" : "Show superseded"}
          </button>
        </section>

        <section className="mt-6" aria-live="polite">
          {interpretations.isLoading ? (
            <p className="border-y border-border/60 py-6 text-sm text-muted-foreground">
              Loading official clarifications…
            </p>
          ) : interpretations.isError ? (
            <div className="border-l-2 border-rose-300/45 px-4 py-2">
              <p className="text-sm font-semibold">Clarifications are temporarily unavailable.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                The current official rulebook remains available.
              </p>
            </div>
          ) : filtered.length ? (
            <div className="divide-y divide-border/65 border-y border-border/65">
              {filtered.map((item) => (
                <article key={item.id} className="py-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <BadgeCheck
                      className={
                        item.status === "superseded"
                          ? "size-4 text-muted-foreground"
                          : "size-4 text-primary"
                      }
                    />
                    <span className="font-mono text-[11px] font-black text-primary">
                      {item.code}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      {item.status === "superseded"
                        ? "Superseded"
                        : item.effective_from
                          ? "Effective " + new Date(item.effective_from).toLocaleDateString()
                          : "Published"}
                    </span>
                  </div>

                  <h2 className="mt-2 text-lg font-bold">{item.title}</h2>

                  <div className="mt-4 border-l-2 border-border pl-4">
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                      Question
                    </p>
                    <p className="mt-1 text-sm leading-6">{item.question}</p>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-primary/80">
                      Official answer
                    </p>
                    <p className="mt-1 text-base font-semibold leading-7">{item.interpretation}</p>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-muted-foreground">
                      Why
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.rationale}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.rule_ids.map((ruleId) => (
                      <Link
                        key={ruleId}
                        to="/rules/$ruleId"
                        params={{ ruleId }}
                        className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 font-mono text-xs font-bold text-primary"
                      >
                        Rule {ruleId}
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="border-y border-border/60 py-7 text-center">
              <p className="text-sm font-semibold">No matching clarifications</p>
              <p className="mt-1 text-xs text-muted-foreground">Try a broader rule or topic.</p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";

import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import {
  findGovernanceQuickAnswer,
} from "@/lib/governance-v5";
import { searchSscRules } from "@/lib/ssc-rules-v4";

export const Route = createFileRoute("/rules/search")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : "",
  }),
  head: () => ({
    meta: [
      { title: "Search Rules — Solaris Song Contest" },
      { name: "description", content: "Search official SSC rules and common rule questions." },
    ],
  }),
  component: RuleSearchPage,
});

function RuleSearchPage() {
  const { q } = Route.useSearch();
  const answer = findGovernanceQuickAnswer(q);
  const results = q.trim() ? searchSscRules(q).slice(0, 20) : [];

  return (
    <RulesRouteShell resolvingTitle="Opening Rule search">
      <div className="mx-auto max-w-5xl pb-20" data-v3-rules-search="">
        <header className="border-b border-border/65 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">Rules</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em]">Search</h1>
        </header>

        <div
          className="sticky top-[calc(4.35rem+env(safe-area-inset-top))] z-20 -mx-2 mt-3 border-b border-border/55 bg-background/92 px-2 py-3 backdrop-blur-xl"
          data-v3-rules-search-sticky=""
        >
          <form action="/rules/search" className="flex min-h-12 items-center gap-2 rounded-2xl border border-border bg-surface/90 px-3 shadow-sm">
            <Search className="size-4.5 shrink-0 text-primary" aria-hidden="true" />
            <input
              name="q"
              defaultValue={q}
              aria-label="Search rules"
              placeholder="Ask about a rule…"
              className="min-h-10 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
              enterKeyHint="search"
            />
            <button type="submit" className="min-h-9 shrink-0 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">
              Search
            </button>
          </form>
        </div>

        {answer ? (
          <section className="mt-6 border-l-2 border-primary/35 pl-4" aria-labelledby="best-rule-answer">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-primary/80">Best answer</p>
            <h2 id="best-rule-answer" className="mt-2 text-xl font-bold">{answer.question}</h2>
            <p className="mt-2 text-2xl font-black text-primary">{answer.answer}</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{answer.explanation}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {answer.ruleIds.map((ruleId) => (
                <Link
                  key={ruleId}
                  to="/rules/$ruleId"
                  params={{ ruleId }}
                  className="inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs font-bold text-primary"
                >
                  Read Rule {ruleId}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-7 scroll-mt-36" aria-labelledby="rule-search-results">
          <div className="flex items-end justify-between gap-3 border-b border-border/65 pb-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-muted-foreground">Official rulebook</p>
              <h2 id="rule-search-results" className="mt-1 text-xl font-bold">
                {q.trim() ? `${results.length} result${results.length === 1 ? "" : "s"} for “${q}”` : "Enter a rule question"}
              </h2>
            </div>
          </div>

          {results.length ? (
            <div className="divide-y divide-border/60">
              {results.map((rule) => (
                <Link
                  key={rule.id}
                  to="/rules/$ruleId"
                  params={{ ruleId: rule.id }}
                  className="flex min-h-20 items-center gap-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/55"
                >
                  <span className="w-12 shrink-0 font-mono text-xs font-black text-primary">{rule.id}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{rule.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{rule.summary}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              ))}
            </div>
          ) : q.trim() ? (
            <div className="py-8" role="status">
              <p className="text-sm font-semibold">No official rule matched “{q}”.</p>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Try a broader rule topic such as confirmation, deadline, voting, friendship, privacy or appeal. No result is inferred from an approximate match.
              </p>
            </div>
          ) : (
            <p className="py-8 text-sm leading-6 text-muted-foreground" role="status">
              Search by rule number, topic or question. Results come from the current published rulebook index.
            </p>
          )}
        </section>
      </div>
    </RulesRouteShell>
  );
}

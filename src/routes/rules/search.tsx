import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Search, Sparkles } from "lucide-react";

import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import {
  GovernanceStatusStrip,
  SolarisDepthEyebrow,
  SolarisDepthPage,
  SolarisDepthSafeZone,
  SolarisDepthSurface,
} from "@/components/SolarisDepth";
import { findGovernanceQuickAnswer } from "@/lib/governance-v5";
import { searchSscRules } from "@/lib/ssc-rules-v4";
import { ROLEPLAY_QUICK_ANSWERS } from "@/lib/ssc-rules/roleplay";

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

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findRoleplayQuickAnswer(query: string) {
  const normalized = normalize(query);
  if (!normalized) return null;
  let best: { answer: (typeof ROLEPLAY_QUICK_ANSWERS)[number]; score: number } | null = null;

  for (const answer of ROLEPLAY_QUICK_ANSWERS) {
    const candidates = [answer.question, ...answer.phrases].map(normalize);
    let score = 0;
    for (const candidate of candidates) {
      if (candidate === normalized) score = Math.max(score, 100);
      else if (candidate.includes(normalized) || normalized.includes(candidate)) score = Math.max(score, 70);
      else {
        const words = normalized.split(" ").filter(Boolean);
        const overlap = words.filter((word) => candidate.includes(word)).length;
        score = Math.max(score, overlap * 10);
      }
    }
    if (!best || score > best.score) best = { answer, score };
  }

  return best && best.score >= 20 ? best.answer : null;
}

function RuleSearchPage() {
  const { q } = Route.useSearch();
  const answer = findRoleplayQuickAnswer(q) ?? findGovernanceQuickAnswer(q);
  const results = q.trim() ? searchSscRules(q).slice(0, 20) : [];

  return (
    <RulesRouteShell resolvingTitle="Opening Rule search">
      <SolarisDepthPage tone="rules">
        <SolarisDepthSafeZone>
          <SolarisDepthSurface variant="action">
            <header>
              <SolarisDepthEyebrow tone="primary">Rules search</SolarisDepthEyebrow>
              <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Find the rule that applies</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Search by rule number, topic or plain-language question. Terms such as invasion, HODless, Dormant and annexation are indexed too.
              </p>
              <GovernanceStatusStrip context="rules" className="mt-3" />
            </header>

            <form action="/rules/search" className="mt-4">
              <label className="flex min-h-13 items-center gap-3 rounded-xl border border-white/[0.09] bg-black/10 px-3 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
                <Search className="size-4.5 shrink-0 text-primary" aria-hidden="true" />
                <input
                  name="q"
                  defaultValue={q}
                  aria-label="Search rules"
                  placeholder="Ask about a rule…"
                  className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
                <button type="submit" className="inline-flex min-h-10 items-center rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground">
                  Search
                </button>
              </label>
            </form>
          </SolarisDepthSurface>
        </SolarisDepthSafeZone>

        {answer ? (
          <SolarisDepthSafeZone className="mt-5">
            <section aria-labelledby="best-rule-answer" className="overflow-hidden rounded-[1.35rem] border border-primary/15 bg-[radial-gradient(circle_at_90%_0%,rgba(82,184,230,.14),transparent_35%),rgba(7,18,42,.72)] p-4 sm:p-5">
              <div className="flex items-center gap-2 text-primary">
                <Sparkles className="size-4" aria-hidden="true" />
                <SolarisDepthEyebrow tone="primary">Best answer</SolarisDepthEyebrow>
              </div>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 id="best-rule-answer" className="text-lg font-bold sm:text-xl">{answer.question}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{answer.explanation}</p>
                </div>
                <span className="solaris-depth-verdict shrink-0 self-start">{answer.answer}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {answer.ruleIds.map((ruleId) => (
                  <Link
                    key={ruleId}
                    to="/rules/$ruleId"
                    params={{ ruleId }}
                    className="inline-flex min-h-10 items-center rounded-xl border border-primary/15 bg-primary/[0.06] px-3 text-xs font-bold text-primary transition hover:bg-primary/[0.1]"
                  >
                    Read Rule {ruleId}
                  </Link>
                ))}
              </div>
            </section>
          </SolarisDepthSafeZone>
        ) : null}

        <SolarisDepthSafeZone className="mt-6">
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <SolarisDepthEyebrow>Official rulebook</SolarisDepthEyebrow>
              <h2 className="mt-1 text-lg font-bold" id="rule-search-results">
                {q.trim() ? `${results.length} result${results.length === 1 ? "" : "s"} for “${q}”` : "Enter a rule question"}
              </h2>
            </div>
          </div>

          {results.length ? (
            <SolarisDepthSurface variant="reading" className="!py-1">
              {results.map((rule) => (
                <Link
                  key={rule.id}
                  to="/rules/$ruleId"
                  params={{ ruleId: rule.id }}
                  className="solaris-depth-row group rounded-xl px-1 transition hover:bg-white/[0.035]"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-black/10 font-mono text-[11px] font-black text-primary">
                    {rule.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold group-hover:text-white">{rule.title}</span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{rule.summary}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              ))}
            </SolarisDepthSurface>
          ) : q.trim() ? (
            <SolarisDepthSurface variant="quiet" className="text-center">
              <p className="text-sm font-semibold">No official rule matched that phrase</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Try broader words such as confirmation, deadline, voting, privacy, invasion, HODless, Dormant or annexation.
              </p>
            </SolarisDepthSurface>
          ) : (
            <SolarisDepthSurface variant="quiet">
              <p className="text-sm text-muted-foreground">
                Search can match chapter topics, official rule text, examples and common-language synonyms.
              </p>
            </SolarisDepthSurface>
          )}
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </RulesRouteShell>
  );
}

import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BadgeCheck, History, MessageCircleQuestion, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { getPublicRuleInterpretations } from "@/lib/rule-interpretations";

export const Route = createFileRoute("/rules/interpretations")({
  head: () => ({
    meta: [
      { title: "Official Interpretations — SSC Rules" },
      {
        name: "description",
        content: "Official TSBC clarifications for how existing Solaris Song Contest rules apply.",
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
      return [item.code, item.title, item.question, item.interpretation, item.rationale, ...item.rule_ids]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [interpretations.data, query, showHistory]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl pb-20">
        <Link to="/rules" className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Rules
        </Link>

        <section className="mt-4 rounded-[1.6rem] border border-violet-200/12 bg-[linear-gradient(145deg,rgba(54,38,96,.22),rgba(5,19,42,.84))] p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.17em] text-violet-200/65">Official interpretations</p>
              <h1 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">Interpretations</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                Official clarifications for how existing SSC rules apply.
              </p>
            </div>
            <MessageCircleQuestion className="mt-1 size-6 shrink-0 text-violet-200/80" />
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3 focus-within:border-violet-200/25">
              <Search className="size-4 text-muted-foreground" />
              <span className="sr-only">Search official interpretations</span>
              <input
                type="search"
                aria-label="Search official interpretations"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search interpretations"
                className="min-w-0 flex-1 border-0 !bg-transparent text-sm shadow-none outline-none placeholder:text-muted-foreground/60 focus-visible:!shadow-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setShowHistory((value) => !value)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/[0.08] px-3 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              <History className="size-4" /> {showHistory ? "Hide superseded" : "Show superseded"}
            </button>
          </div>
        </section>

        <section className="mt-4 space-y-3">
          {interpretations.isLoading ? (
            <div className="rounded-xl border border-white/[0.08] p-6 text-sm text-muted-foreground">Loading interpretations…</div>
          ) : interpretations.isError ? (
            <div className="rounded-xl border border-rose-200/12 bg-rose-200/[0.035] p-5 text-sm text-rose-50">Interpretations are temporarily unavailable.</div>
          ) : filtered.length ? (
            filtered.map((item) => (
              <article key={item.id} className="rounded-[1.35rem] border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BadgeCheck className={item.status === "superseded" ? "size-4 text-muted-foreground" : "size-4 text-violet-200"} />
                    <span className="font-mono text-[10px] font-black text-violet-100">{item.code}</span>
                  </div>
                  <span className="text-[9px] uppercase tracking-[.1em] text-muted-foreground">
                    {item.status === "superseded" ? "superseded" : item.effective_from ? `effective ${new Date(item.effective_from).toLocaleDateString()}` : "published"}
                  </span>
                </div>
                <h2 className="mt-3 text-lg font-black">{item.title}</h2>
                <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/10 p-3">
                  <p className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Question</p>
                  <p className="mt-1 text-sm leading-6 text-slate-200/85">{item.question}</p>
                </div>
                <p className="mt-4 text-sm font-semibold leading-6 text-slate-100">{item.interpretation}</p>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.rationale}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {item.rule_ids.map((ruleId) => (
                    <Link key={ruleId} to="/rules/$ruleId" params={{ ruleId }} className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1.5 text-[10px] font-bold text-sky-200">
                      Rule {ruleId}
                    </Link>
                  ))}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.08] p-7 text-center">
              <BadgeCheck className="mx-auto size-6 text-violet-200" />
              <p className="mt-3 font-bold">No matching interpretations</p>
              <p className="mt-1 text-xs text-muted-foreground">Try another search term.</p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

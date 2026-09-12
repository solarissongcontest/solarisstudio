import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, History, MessageCircleQuestion, RefreshCw } from "lucide-react";

import {
  getPublicRuleInterpretations,
  type RuleInterpretation,
} from "@/lib/rule-interpretations";
import { cn } from "@/lib/utils";

export function RuleInterpretationsPanel({ ruleId }: { ruleId: string }) {
  const query = useQuery({
    queryKey: ["public-rule-interpretations", ruleId],
    queryFn: () => getPublicRuleInterpretations(ruleId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (query.isLoading) {
    return (
      <section className="mx-auto mt-5 max-w-5xl rounded-[1.5rem] border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="size-4 animate-spin" /> Loading official interpretations…
        </div>
      </section>
    );
  }

  if (query.isError) {
    return (
      <section className="mx-auto mt-5 max-w-5xl rounded-[1.5rem] border border-amber-200/12 bg-amber-200/[0.035] p-5">
        <p className="text-sm font-bold text-amber-50">Official interpretations could not be loaded.</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          The regulation above remains the official rule. Interpretation records are supplemental guidance, not a replacement for the rule text.
        </p>
      </section>
    );
  }

  const items = query.data ?? [];
  if (!items.length) return null;
  const current = items.filter((item) => item.status === "published");
  const historical = items.filter((item) => item.status === "superseded");

  return (
    <section className="mx-auto mt-5 max-w-5xl rounded-[1.7rem] border border-violet-200/12 bg-[linear-gradient(150deg,rgba(46,32,86,.18),rgba(5,18,39,.94))] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.16em] text-violet-200/70">OFFICIAL INTERPRETATIONS</p>
          <h2 className="mt-2 text-xl font-black">How TSBC has formally applied this rule</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">
            Interpretations clarify how an existing regulation applies to recurring or difficult situations. They do not silently rewrite the rule itself.
          </p>
        </div>
        <Link to="/rules/interpretations" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-violet-200/12 bg-violet-200/[0.04] px-3 text-xs font-bold text-violet-100">
          <MessageCircleQuestion className="size-4" /> All interpretations
        </Link>
      </div>

      <div className="mt-5 space-y-3">
        {current.map((item) => <InterpretationCard key={item.id} item={item} />)}
      </div>

      {historical.length ? (
        <details className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-muted-foreground [&::-webkit-details-marker]:hidden">
            <History className="size-4" /> {historical.length} superseded interpretation{historical.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-3 space-y-3">
            {historical.map((item) => <InterpretationCard key={item.id} item={item} historical />)}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function InterpretationCard({ item, historical = false }: { item: RuleInterpretation; historical?: boolean }) {
  return (
    <article className={cn("rounded-xl border p-4", historical ? "border-white/[0.07] bg-white/[0.015] opacity-80" : "border-violet-200/12 bg-violet-200/[0.035]")}> 
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BadgeCheck className={cn("size-4", historical ? "text-muted-foreground" : "text-violet-200")} />
          <span className="font-mono text-[10px] font-black text-violet-100">{item.code}</span>
        </div>
        <span className="text-[9px] uppercase tracking-[.1em] text-muted-foreground">
          {historical ? "superseded" : item.effective_from ? `effective ${new Date(item.effective_from).toLocaleDateString()}` : "published"}
        </span>
      </div>
      <h3 className="mt-3 text-sm font-black">{item.title}</h3>
      <div className="mt-3 rounded-lg border border-white/[0.06] bg-black/10 p-3">
        <p className="text-[9px] font-black uppercase tracking-[.1em] text-muted-foreground">Question</p>
        <p className="mt-1 text-xs leading-5 text-slate-200/85">{item.question}</p>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-100">{item.interpretation}</p>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.rationale}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.rule_ids.map((ruleId) => (
          <Link key={ruleId} to="/rules/$ruleId" params={{ ruleId }} className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-1 text-[10px] font-bold text-sky-200">
            Rule {ruleId}
          </Link>
        ))}
      </div>
    </article>
  );
}

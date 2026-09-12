import { Link } from "@tanstack/react-router";
import { BookOpen, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { RulesExperience } from "@/components/rules/RulesExperience";
import { SSC_RULEBOOK, searchSscRules } from "@/lib/ssc-rules-v4";

export function RulesExperienceRefined() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => (query.trim() ? searchSscRules(query).slice(0, 16) : []), [query]);
  const searching = Boolean(query.trim());

  return (
    <div className="pb-20">
      <section className="rounded-[1.6rem] border border-sky-200/12 bg-[#06152d] p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-sky-200/14 bg-sky-200/[0.05] px-2.5 py-1 text-[9px] font-black uppercase tracking-[.16em] text-sky-100">Official rules</span>
          <span className="font-mono text-[10px] uppercase tracking-[.13em] text-muted-foreground">v{SSC_RULEBOOK.version}</span>
        </div>
        <h1 className="mt-4 text-3xl font-black tracking-[-.04em] text-white sm:text-4xl">Rulebook</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200/70">Read or search the official SSC regulations.</p>

        <label className="mt-5 flex min-h-11 max-w-2xl items-center gap-2 rounded-xl border border-white/[0.09] bg-black/10 px-3 focus-within:border-sky-200/25">
          <Search className="size-4 shrink-0 text-sky-200" aria-hidden="true" />
          <span className="sr-only">Search SSC rules</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search rules"
            className="min-w-0 flex-1 border-0 !bg-transparent text-sm shadow-none outline-none placeholder:text-muted-foreground/60 focus-visible:!shadow-none"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-white/[0.04] hover:text-white">
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>
      </section>

      {searching ? (
        <section className="mt-4 rounded-[1.5rem] border border-white/[0.08] bg-white/[0.02] p-4 sm:p-5" aria-label="Rule search results">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black">Search results</h2>
            <span className="text-[10px] text-muted-foreground">{results.length}</span>
          </div>
          {results.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {results.map((rule) => (
                <Link key={rule.id} to="/rules/$ruleId" params={{ ruleId: rule.id }} className="rounded-xl border border-white/[0.07] bg-black/10 p-3 transition hover:border-sky-200/18 hover:bg-white/[0.035]">
                  <div className="flex items-center gap-2">
                    <BookOpen className="size-3.5 text-sky-200" />
                    <span className="font-mono text-[10px] font-black text-sky-200">Rule {rule.id}</span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-white">{rule.title}</h3>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{rule.summary}</p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.08] p-6 text-center text-sm text-muted-foreground">No matching rules.</div>
          )}
        </section>
      ) : (
        <div className="[&>div>section:first-child]:hidden">
          <RulesExperience />
        </div>
      )}
    </div>
  );
}

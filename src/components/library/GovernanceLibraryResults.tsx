import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  FileClock,
  Gavel,
  SearchCheck,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import {
  governanceLibraryGroups,
  governanceRuleResults,
  searchGovernanceLibrary,
  type GovernanceLibraryKind,
  type GovernanceLibraryResult,
} from "@/lib/public-library-governance";
import type { SharedRuleContext } from "@/lib/rule-context";
import type { RuleInterpretation } from "@/lib/rule-interpretations";
import type { RulebookRelease } from "@/lib/rules-governance";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<GovernanceLibraryKind, LucideIcon> = {
  destination: BookOpen,
  chapter: BookOpen,
  rule: Gavel,
  interpretation: FileClock,
  release: FileClock,
};

export function GovernanceLibraryResults({
  query,
  interpretations = [],
  releases = [],
  limit = 12,
  compact = false,
  onNavigate,
}: {
  query: string;
  interpretations?: RuleInterpretation[];
  releases?: RulebookRelease[];
  limit?: number;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const results = searchGovernanceLibrary(query, interpretations, releases).slice(0, limit);
  const groups = governanceLibraryGroups(results);

  if (!groups.length) return null;

  return (
    <section aria-label="Rules and Integrity Library results" className="space-y-4">
      {groups.map(({ group, results: grouped }) => (
        <div key={group}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            {group === "Trust & Integrity" ? (
              <ShieldCheck className="size-3.5 text-emerald-200" />
            ) : (
              <BookOpen className="size-3.5 text-sky-200" />
            )}
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/75">
              {group}
            </p>
          </div>
          <div className="space-y-1">
            {grouped.map((result) => (
              <GovernanceLibraryResultRow
                key={result.id}
                result={result}
                compact={compact}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function GovernanceLibraryContextResults({ context }: { context: SharedRuleContext }) {
  const results = governanceRuleResults(context.ruleIds);
  if (!results.length) return null;

  return (
    <section
      aria-label="Rules relevant to the page you came from"
      className="mb-4 rounded-2xl border border-sky-200/12 bg-sky-200/[0.045] p-3"
    >
      <div className="px-1 pb-2">
        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-sky-200/70">Relevant here</p>
        <h3 className="mt-1 text-sm font-black text-foreground">{context.title}</h3>
        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{context.intro}</p>
      </div>
      <div className="space-y-1">
        {results.map((result) => (
          <GovernanceLibraryResultRow key={result.id} result={result} compact />
        ))}
      </div>
    </section>
  );
}

export function GovernanceLibraryEmptyHint({ query }: { query: string }) {
  if (!query.trim()) return null;

  return (
    <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-5 text-center">
      <SearchCheck className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
        No Rules or Integrity result matches “{query.trim()}”.
      </p>
    </div>
  );
}

function GovernanceLibraryResultRow({
  result,
  compact,
  onNavigate,
}: {
  result: GovernanceLibraryResult;
  compact: boolean;
  onNavigate?: () => void;
}) {
  const Icon = KIND_ICON[result.kind];
  const integrity = result.group === "Trust & Integrity";

  return (
    <Link
      to={result.to as any}
      onClick={onNavigate}
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-transparent transition-colors hover:border-white/[0.07] hover:bg-white/[0.04]",
        compact ? "px-2.5 py-2" : "px-3 py-3",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid shrink-0 place-items-center rounded-lg border",
          compact ? "size-7" : "size-9",
          integrity
            ? "border-emerald-200/10 bg-emerald-200/[0.045] text-emerald-100"
            : "border-sky-200/10 bg-sky-200/[0.045] text-sky-100",
        )}
      >
        <Icon className={compact ? "size-3.5" : "size-4"} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-xs font-bold text-foreground">{result.title}</span>
          {result.badge ? (
            <span className="rounded-full border border-white/[0.08] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-muted-foreground">
              {result.badge}
            </span>
          ) : null}
        </span>
        {!compact ? (
          <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-muted-foreground">
            {result.description}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

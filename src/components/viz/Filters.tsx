import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { Edition } from "@/lib/data";
import { editionLabel } from "@/lib/data";

export type ShowKindFilter = "all" | "grand-final" | "semi-final";
export type VoteTypeFilter = "all" | "jury" | "televote";

export type AnalysisFiltersState = {
  editionIds: string[];
  showKind: ShowKindFilter;
  voteType: VoteTypeFilter;
};

export const DEFAULT_ANALYSIS_FILTERS: AnalysisFiltersState = {
  editionIds: [],
  showKind: "all",
  voteType: "all",
};

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-lg px-3 text-xs font-medium transition-colors",
        active
          ? "bg-aurora text-primary-foreground"
          : "bg-surface text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function Filters({
  editions,
  value,
  onChange,
}: {
  editions: Edition[];
  value: AnalysisFiltersState;
  onChange: (next: AnalysisFiltersState) => void;
}) {
  const [editionsOpen, setEditionsOpen] = useState(false);

  const sortedEditions = useMemo(
    () => [...editions].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    [editions],
  );

  const toggleEdition = (id: string) => {
    const set = new Set(value.editionIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onChange({ ...value, editionIds: [...set] });
  };

  const editionSummary =
    value.editionIds.length === 0
      ? "All editions"
      : value.editionIds.length === 1
        ? editionLabel(
            sortedEditions.find((e) => e.id === value.editionIds[0]) ??
              sortedEditions[0],
          )
        : `${value.editionIds.length} editions`;

  return (
    <>
      {/* Mobile: one compact expandable filter card. */}
      <details className="glass mb-4 md:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Filters
            </span>
            <span className="block truncate text-sm font-medium">
              {editionSummary} ·{" "}
              {value.showKind === "all"
                ? "all shows"
                : value.showKind === "grand-final"
                  ? "finals"
                  : "semi-finals"}{" "}
              ·{" "}
              {value.voteType === "all"
                ? "all votes"
                : value.voteType}
            </span>
          </span>
          <span className="shrink-0 text-muted-foreground">▾</span>
        </summary>

        <div className="space-y-4 border-t border-border p-3">
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Editions
            </p>

            <button
              type="button"
              onClick={() => onChange({ ...value, editionIds: [] })}
              className={cn(
                "mb-2 min-h-10 w-full rounded-lg border px-3 text-left text-xs",
                value.editionIds.length === 0
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-surface",
              )}
            >
              All editions
            </button>

            <div className="scroll-slim max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-1">
              {sortedEditions.map((edition) => (
                <label
                  key={edition.id}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    checked={value.editionIds.includes(edition.id)}
                    onChange={() => toggleEdition(edition.id)}
                  />
                  <span className="min-w-0 truncate">{editionLabel(edition)}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Show
            </p>
            <div className="grid grid-cols-3 gap-1">
              {(["all", "grand-final", "semi-final"] as ShowKindFilter[]).map(
                (kind) => (
                  <SegButton
                    key={kind}
                    active={value.showKind === kind}
                    onClick={() => onChange({ ...value, showKind: kind })}
                  >
                    {kind === "all"
                      ? "All"
                      : kind === "grand-final"
                        ? "Finals"
                        : "Semis"}
                  </SegButton>
                ),
              )}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Votes
            </p>
            <div className="grid grid-cols-3 gap-1">
              {(["all", "jury", "televote"] as VoteTypeFilter[]).map((kind) => (
                <SegButton
                  key={kind}
                  active={value.voteType === kind}
                  onClick={() => onChange({ ...value, voteType: kind })}
                >
                  {kind === "all"
                    ? "All"
                    : kind === "jury"
                      ? "Jury"
                      : "Televote"}
                </SegButton>
              ))}
            </div>
          </div>
        </div>
      </details>

      {/* Desktop/tablet filter bar. */}
      <div className="glass sticky top-[72px] z-20 mb-6 hidden flex-wrap items-center gap-3 p-4 md:flex">
        <div className="relative">
          <button
            type="button"
            onClick={() => setEditionsOpen((v) => !v)}
            className="rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-strong"
          >
            {editionSummary} ▾
          </button>

          {editionsOpen && (
            <div className="absolute left-0 top-full z-30 mt-2 max-h-72 w-56 overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-2xl">
              <button
                className="mb-1 w-full rounded-md px-2 py-1 text-left text-xs text-primary hover:bg-surface"
                onClick={() => onChange({ ...value, editionIds: [] })}
              >
                Clear (all editions)
              </button>

              {sortedEditions.map((edition) => (
                <label
                  key={edition.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-surface"
                >
                  <input
                    type="checkbox"
                    checked={value.editionIds.includes(edition.id)}
                    onChange={() => toggleEdition(edition.id)}
                  />
                  {editionLabel(edition)}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            Show
          </span>
          {(["all", "grand-final", "semi-final"] as ShowKindFilter[]).map(
            (kind) => (
              <SegButton
                key={kind}
                active={value.showKind === kind}
                onClick={() => onChange({ ...value, showKind: kind })}
              >
                {kind === "all"
                  ? "All"
                  : kind === "grand-final"
                    ? "Finals"
                    : "Semi-finals"}
              </SegButton>
            ),
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-[11px] uppercase tracking-widest text-muted-foreground">
            Votes
          </span>
          {(["all", "jury", "televote"] as VoteTypeFilter[]).map((kind) => (
            <SegButton
              key={kind}
              active={value.voteType === kind}
              onClick={() => onChange({ ...value, voteType: kind })}
            >
              {kind === "all"
                ? "Jury + Televote"
                : kind === "jury"
                  ? "Jury"
                  : "Televote"}
            </SegButton>
          ))}
        </div>
      </div>
    </>
  );
}

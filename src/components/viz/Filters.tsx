import { useMemo, useState, type ReactNode } from "react";

import type { Edition } from "@/lib/data";
import { editionLabel } from "@/lib/data";
import { cn } from "@/lib/utils";

export type ShowKindFilter = "all" | "grand-final" | "semi-final";

export type AnalysisFiltersState = {
  editionIds: string[];
  showKind: ShowKindFilter;
};

export const DEFAULT_ANALYSIS_FILTERS: AnalysisFiltersState = {
  editionIds: [],
  showKind: "all",
};

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-10 min-w-0 rounded-lg px-3 text-xs font-medium transition-colors",
        active
          ? "bg-aurora text-primary-foreground"
          : "bg-surface text-muted-foreground hover:bg-surface-strong hover:text-foreground",
      )}
    >
      <span className="block truncate">{children}</span>
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
    () =>
      [...editions].sort(
        (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
      ),
    [editions],
  );

  const toggleEdition = (id: string) => {
    const selected = new Set(value.editionIds);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);

    onChange({
      ...value,
      editionIds: [...selected],
    });
  };

  const selectedEdition =
    value.editionIds.length === 1
      ? sortedEditions.find((edition) => edition.id === value.editionIds[0])
      : null;

  const editionSummary =
    value.editionIds.length === 0
      ? "All editions"
      : selectedEdition
        ? editionLabel(selectedEdition)
        : `${value.editionIds.length} editions`;

  const showSummary =
    value.showKind === "all"
      ? "All shows"
      : value.showKind === "grand-final"
        ? "Grand Finals"
        : "Semi-finals";

  const hasFilters = value.editionIds.length > 0 || value.showKind !== "all";

  const reset = () => {
    onChange(DEFAULT_ANALYSIS_FILTERS);
    setEditionsOpen(false);
  };

  return (
    <>
      <details className="glass mb-4 overflow-hidden md:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Analysis filters
            </span>
            <span className="mt-0.5 block truncate text-sm font-medium">
              {editionSummary} · {showSummary}
            </span>
          </span>
          <span className="shrink-0 text-sm text-muted-foreground">▾</span>
        </summary>

        <div className="space-y-5 border-t border-border/60 p-3">
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Editions
              </p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={reset}
                  className="text-[10px] font-semibold text-primary"
                >
                  Reset
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => onChange({ ...value, editionIds: [] })}
              className={cn(
                "mb-2 min-h-10 w-full rounded-lg border px-3 text-left text-xs transition-colors",
                value.editionIds.length === 0
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-surface text-foreground",
              )}
            >
              All editions
            </button>

            <div className="scroll-slim max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border bg-black/5 p-1">
              {sortedEditions.map((edition) => {
                const checked = value.editionIds.includes(edition.id);
                return (
                  <label
                    key={edition.id}
                    className={cn(
                      "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-xs transition-colors",
                      checked ? "bg-primary/10 text-primary" : "hover:bg-surface",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEdition(edition.id)}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {editionLabel(edition)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Show
            </p>
            <div className="grid grid-cols-3 gap-1">
              {(["all", "grand-final", "semi-final"] as ShowKindFilter[]).map((kind) => (
                <SegButton
                  key={kind}
                  active={value.showKind === kind}
                  onClick={() => onChange({ ...value, showKind: kind })}
                >
                  {kind === "all" ? "All" : kind === "grand-final" ? "Finals" : "Semis"}
                </SegButton>
              ))}
            </div>
          </div>

          <p className="rounded-xl bg-surface px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            Filters change the archive sample used by every Analysis view below.
          </p>
        </div>
      </details>

      <div className="glass sticky top-[72px] z-20 mb-6 hidden min-w-0 flex-wrap items-center gap-3 p-3 md:flex lg:p-4">
        <div className="relative min-w-0 max-w-full">
          <button
            type="button"
            onClick={() => setEditionsOpen((current) => !current)}
            className="flex min-h-10 max-w-[min(19rem,50vw)] items-center gap-2 rounded-lg bg-surface px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-strong"
            aria-expanded={editionsOpen}
          >
            <span className="min-w-0 truncate">{editionSummary}</span>
            <span className="shrink-0 text-muted-foreground">▾</span>
          </button>

          {editionsOpen && (
            <div className="absolute left-0 top-full z-30 mt-2 max-h-80 w-[min(19rem,80vw)] overflow-y-auto rounded-xl border border-border bg-popover p-2 shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  onChange({ ...value, editionIds: [] });
                  setEditionsOpen(false);
                }}
                className="mb-1 w-full rounded-lg px-2.5 py-2 text-left text-xs font-medium text-primary transition-colors hover:bg-surface"
              >
                All editions
              </button>

              <div className="mb-1 border-t border-border/60" />

              {sortedEditions.map((edition) => {
                const checked = value.editionIds.includes(edition.id);
                return (
                  <label
                    key={edition.id}
                    className={cn(
                      "flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-xs transition-colors",
                      checked ? "bg-primary/10 text-primary" : "hover:bg-surface",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleEdition(edition.id)}
                    />
                    <span className="min-w-0 flex-1 truncate">{editionLabel(edition)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-1">
          <span className="mr-1 hidden text-[11px] uppercase tracking-widest text-muted-foreground lg:inline">
            Show
          </span>
          {(["all", "grand-final", "semi-final"] as ShowKindFilter[]).map((kind) => (
            <SegButton
              key={kind}
              active={value.showKind === kind}
              onClick={() => onChange({ ...value, showKind: kind })}
            >
              {kind === "all" ? "All" : kind === "grand-final" ? "Finals" : "Semis"}
            </SegButton>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[10px] text-muted-foreground xl:inline">
            Filters apply to every view
          </span>
          {hasFilters && (
            <button
              type="button"
              onClick={reset}
              className="min-h-10 rounded-lg border border-border bg-surface px-3 text-xs font-semibold text-primary"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </>
  );
}

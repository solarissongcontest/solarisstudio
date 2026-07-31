import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Edition } from "@/lib/data";
import { editionLabel } from "@/lib/data";

export type ShowKindFilter = "all" | "grand-final" | "semi-final";
export type VoteTypeFilter = "all" | "jury" | "televote";

export type AnalysisFiltersState = {
  editionIds: string[]; // empty = all editions
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
        "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-aurora text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground",
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
        ? editionLabel(sortedEditions.find((e) => e.id === value.editionIds[0]) ?? sortedEditions[0])
        : `${value.editionIds.length} editions`;

  return (
    <div className="glass sticky top-[64px] z-20 mb-6 flex flex-wrap items-center gap-3 p-4">
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
            {sortedEditions.map((e) => (
              <label
                key={e.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-surface"
              >
                <input
                  type="checkbox"
                  checked={value.editionIds.includes(e.id)}
                  onChange={() => toggleEdition(e.id)}
                />
                {editionLabel(e)}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-1 text-[11px] uppercase tracking-widest text-muted-foreground">Show</span>
        {(["all", "grand-final", "semi-final"] as ShowKindFilter[]).map((k) => (
          <SegButton key={k} active={value.showKind === k} onClick={() => onChange({ ...value, showKind: k })}>
            {k === "all" ? "All" : k === "grand-final" ? "Finals" : "Semi-finals"}
          </SegButton>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <span className="mr-1 text-[11px] uppercase tracking-widest text-muted-foreground">Votes</span>
        {(["all", "jury", "televote"] as VoteTypeFilter[]).map((k) => (
          <SegButton key={k} active={value.voteType === k} onClick={() => onChange({ ...value, voteType: k })}>
            {k === "all" ? "Jury + Televote" : k === "jury" ? "Jury" : "Televote"}
          </SegButton>
        ))}
      </div>
    </div>
  );
}

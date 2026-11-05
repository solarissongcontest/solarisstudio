import { Link } from "@tanstack/react-router";
import { SlidersHorizontal, Table2 } from "lucide-react";
import { useMemo, useState } from "react";

import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import "@/styles/v3-directory-family.css";

import type { V3ScorechartIndexItem } from "@/lib/v3-scorecharts";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3Surface,
} from "./V3Foundation";

export function V3ScorechartsScreen({
  items,
  generatedAt,
}: {
  items: readonly V3ScorechartIndexItem[];
  generatedAt: string;
}) {
  const [search, setSearch] = useState("");
  const [editionId, setEditionId] = useState("all");
  const editionOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) seen.set(item.editionId, item.editionName);
    return [...seen.entries()].map(([id, label]) => ({
      id,
      label,
      count: items.filter((item) => item.editionId === id).length,
    }));
  }, [items]);
  const terms = search.trim().toLocaleLowerCase().split(/\\s+/).filter(Boolean);
  const searched = items.filter((item) => {
    const text = [item.editionName, item.showName, item.showKind.replaceAll("-", " ")]
      .join(" ").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  const visible = searched.filter((item) => editionId === "all" || item.editionId === editionId);
  const options = [
    { id: "all", label: "All editions", count: searched.length },
    ...editionOptions.map((option) => ({
      ...option,
      count: searched.filter((item) => item.editionId === option.id).length,
    })),
  ];
  const selected = options.find((option) => option.id === editionId) ?? options[0];
  const groups = new Map<
    string,
    { editionName: string; items: V3ScorechartIndexItem[] }
  >();

  for (const item of visible) {
    const existing = groups.get(item.editionId);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(item.editionId, { editionName: item.editionName, items: [item] });
    }
  }

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Detailed voting"
        title="Full Scorecharts"
        description="Browse complete published voting matrices. Rows receive points and columns give them."
        editorial
      />

      <div className="v3-directory-family" data-directory-experience="installed-app">
        <div className="v3-directory-controls">
          <SolarisSearchField value={search} onChange={setSearch}
            label="Search scorecharts" placeholder="Search show or edition…" />
          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className="v3-directory-sheet-trigger" aria-label="Filter scorecharts by edition">
                <SlidersHorizontal size={18} aria-hidden="true" />
                <span>{selected.label}</span><span className="v3-directory-count">{selected.count}</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" aria-label="Filter scorecharts by edition" className="max-h-[80dvh] overflow-y-auto">
              <h2 className="mb-3 text-lg font-bold">Browse by edition</h2>
              <div className="v3-directory-sheet-options">
                {options.map((option) => (
                  <SheetClose asChild key={option.id}>
                    <button type="button" aria-pressed={editionId === option.id}
                      onClick={() => setEditionId(option.id)}>
                      {option.label} <span>{option.count}</span>
                    </button>
                  </SheetClose>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <p className="v3-directory-results-count" role="status">{visible.length} matching scorecharts</p>
      </div>

      <V3Surface level="raised" className="p-5">
        <p className="v3-kicker">How to read it</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold">Rows receive</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Follow an entry down the left side to see every published score it received.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Columns give</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Follow a voter across the top to see its published distribution.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Publication wins</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              A scorechart appears here only after detailed voting is officially public.
            </p>
          </div>
        </div>
      </V3Surface>

      <V3Section
        title="Published detailed voting"
        meta={`${visible.length} ${visible.length === 1 ? "scorechart" : "scorecharts"}`}
      >
        {visible.length === 0 ? (
          <V3Surface className="p-5">
            <div role="status" data-v3-scorecharts-empty="">
              <p className="text-sm font-semibold">{items.length ? "No matching scorecharts" : "No published scorecharts yet"}</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                {items.length ? "Try another show or edition." : "Detailed voting appears only after a show publishes its full voting matrix."}
              </p>
              {items.length ? (
                <button type="button" onClick={() => { setSearch(""); setEditionId("all"); }}
                  className="mt-3 min-h-11 rounded-lg border border-border px-3 text-sm font-semibold">
                  Clear filters
                </button>
              ) : null}
            </div>
          </V3Surface>
        ) : (
          <div className="grid gap-5">
            {[...groups.entries()].map(([editionId, group]) => (
              <section key={editionId} aria-labelledby={`scorecharts-${editionId}`}>
                <h3
                  id={`scorecharts-${editionId}`}
                  className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-white/48"
                >
                  {group.editionName}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.items.map((item) => (
                    <Link
                      key={item.showId}
                      to="/shows/$showId"
                      params={{ showId: item.showId }}
                      search={{ tab: "matrix", from: "results" }}
                      className="block rounded-[var(--v3-radius-xl)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    >
                      <V3Surface
                        level="raised"
                        className="flex min-h-24 items-center gap-4 p-4 transition hover:bg-white/[0.045]"
                      >
                        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.055]">
                          <Table2 className="size-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {item.showName}
                          </span>
                          <span className="mt-1 block text-xs capitalize text-white/45">
                            {item.showKind.replaceAll("-", " ")} · full voting matrix
                          </span>
                        </span>
                      </V3Surface>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </V3Section>

      <p className="sr-only">
        Scorechart index refreshed from published Solaris state at {generatedAt}.
      </p>
    </V3Screen>
  );
}

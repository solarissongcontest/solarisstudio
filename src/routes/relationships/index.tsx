import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { ResponsiveTabs } from "@/components/ResponsiveTabs";
import { useCompleteJuryArchive } from "@/lib/complete-jury";
import {
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
  type Country,
} from "@/lib/data";
import { computeRelationship } from "@/lib/stats";

export const Route = createFileRoute("/relationships/")({
  head: () => ({
    meta: [{ title: "Relationships — Solaris Studio" }],
  }),
  component: RelationshipsPage,
});

const TABS = [
  { value: "all", label: "All" },
  { value: "alliances", label: "Strong support" },
  { value: "rivalries", label: "Close rivals" },
  { value: "one-sided", label: "One-sided" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function pairParam(a: Country, b: Country) {
  return `${a.short_code}-vs-${b.short_code}`.toUpperCase();
}

function RelationshipsPage() {
  const { data: countries } = useCountries();
  const { data: participants } = useAllParticipants();
  const { data: jury } = useCompleteJuryArchive();
  const { data: results } = useAllResults();
  const { data: shows } = useAllShows();
  const { data: editions } = useEditions();

  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const cList = countries ?? [];

  const pairs = useMemo(() => {
    const editionsByCountry = new Map<string, Set<string>>();

    (participants ?? []).forEach((participant) => {
      const set = editionsByCountry.get(participant.country_id) ?? new Set<string>();
      set.add(participant.edition_id);
      editionsByCountry.set(participant.country_id, set);
    });

    const out: Array<{
      a: Country;
      b: Country;
      shared: number;
      rel: ReturnType<typeof computeRelationship>;
    }> = [];

    for (let i = 0; i < cList.length; i += 1) {
      for (let j = i + 1; j < cList.length; j += 1) {
        const a = cList[i];
        const b = cList[j];
        const setA = editionsByCountry.get(a.id);
        const setB = editionsByCountry.get(b.id);
        if (!setA || !setB) continue;

        let shared = 0;
        setA.forEach((id) => {
          if (setB.has(id)) shared += 1;
        });
        if (!shared) continue;

        out.push({
          a,
          b,
          shared,
          rel: computeRelationship(a.id, b.id, {
            editions: editions ?? [],
            jury: jury ?? [],
            results: results ?? [],
            shows: shows ?? [],
          }),
        });
      }
    }

    return out;
  }, [cList, participants, editions, jury, results, shows]);

  const oneSidedMap = useMemo(() => {
    const map = new Map<string, number>();
    pairs.forEach((item) => {
      const gap = Math.abs(item.rel.normalizedAtoB - item.rel.normalizedBtoA);
      if (gap >= 15) {
        map.set([item.a.id, item.b.id].sort().join("|"), gap);
      }
    });
    return map;
  }, [pairs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    let rows = pairs.filter(
      ({ a, b }) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        b.name.toLowerCase().includes(q) ||
        a.short_code.toLowerCase().includes(q) ||
        b.short_code.toLowerCase().includes(q),
    );

    if (tab === "alliances") {
      rows = [...rows].sort((a, b) => b.rel.friendshipScore - a.rel.friendshipScore);
    } else if (tab === "rivalries") {
      rows = [...rows].sort((a, b) => b.rel.rivalryScore - a.rel.rivalryScore);
    } else if (tab === "one-sided") {
      rows = [...rows]
        .map((row) => ({
          ...row,
          gap: oneSidedMap.get([row.a.id, row.b.id].sort().join("|")) ?? 0,
        }))
        .filter((row) => row.gap > 0)
        .sort((a, b) => b.gap - a.gap);
    } else {
      rows = [...rows].sort((a, b) => b.shared - a.shared);
    }

    return rows;
  }, [pairs, query, tab, oneSidedMap]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Voting patterns"
        title="Relationships"
        description="Compare repeated support and competitive history between countries that have appeared together. These scores describe patterns in the archive, not motives or coordinated voting."
      />

      <Panel className="mb-5" title="What the scores mean">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricGuide
            title="Support"
            text="How strongly the two countries have supported each other, adjusted for how often they could vote for one another."
          />
          <MetricGuide
            title="Rivalry"
            text="How often their results and competitive positions have been closely matched. A high score does not mean personal hostility."
          />
          <MetricGuide
            title="One-sided gap"
            text="The difference between support flowing in each direction. Larger gaps mean one country has historically supported the other more strongly."
          />
        </div>
      </Panel>

      <Panel className="mb-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <input
            aria-label="Search countries"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a country…"
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none"
          />
          <ResponsiveTabs value={tab} options={TABS} onChange={setTab} label="Relationship type" />
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2">
        {filtered.slice(0, 40).map((row: any) => (
          <Link
            key={`${row.a.id}-${row.b.id}`}
            to="/relationships/$pair"
            params={{ pair: pairParam(row.a, row.b) }}
            className="glass block p-4 transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <FlagChip
                code={row.a.short_code}
                color={row.a.accent_color}
                image={row.a.flag_image}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.a.name}</span>
              <span className="text-xs text-muted-foreground">vs</span>
              <FlagChip
                code={row.b.short_code}
                color={row.b.accent_color}
                image={row.b.flag_image}
                size="sm"
              />
              <span className="min-w-0 flex-1 truncate text-right text-sm font-medium">
                {row.b.name}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border/60 pt-3">
              <Mini label="Shared" value={row.shared} />
              <Mini label="Support" value={`${row.rel.friendshipScore.toFixed(0)}%`} />
              <Mini
                label={tab === "one-sided" ? "Gap" : "Rivalry"}
                value={
                  tab === "one-sided"
                    ? `${(row.gap ?? 0).toFixed(0)}%`
                    : `${row.rel.rivalryScore.toFixed(0)}%`
                }
              />
            </div>
          </Link>
        ))}

        {!filtered.length && (
          <div className="glass p-6 text-center text-sm text-muted-foreground md:col-span-2">
            No relationships match this view.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MetricGuide({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="numeric mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

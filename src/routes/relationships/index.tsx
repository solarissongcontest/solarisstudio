import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { computeRelationship } from "@/lib/stats";
import { relationships } from "@/lib/analysis";
import { useAllJuryVotes, useAllParticipants, useAllResults, useCountries, useEditions, type Country } from "@/lib/data";

export const Route = createFileRoute("/relationships/")({
  head: () => ({
    meta: [
      { title: "Country relationships — Solaris Scoreboard Studio" },
      {
        name: "description",
        content:
          "Explore alliances, rivalries and one-sided voting relationships between every pair of nations that has shared an SSC edition.",
      },
      { property: "og:title", content: "Country relationships — Solaris Scoreboard Studio" },
      { property: "og:description", content: "Alliances, rivalries and mutual 12-point exchanges across Terra Solaris." },
    ],
  }),
  component: RelationshipsIndex,
});

function pairParam(a: Country, b: Country) {
  return `${a.short_code}-vs-${b.short_code}`.toUpperCase();
}

function RelationshipsIndex() {
  const { data: countries } = useCountries();
  const { data: participants } = useAllParticipants();
  const { data: jury } = useAllJuryVotes();
  const { data: results } = useAllResults();
  const { data: editions } = useEditions();
  const [query, setQuery] = useState("");

  const cList = countries ?? [];
  const cMap = new Map(cList.map((c) => [c.id, c]));

  const sharedPairs = useMemo(() => {
    const editionsByCountry = new Map<string, Set<string>>();
    (participants ?? []).forEach((p) => {
      const set = editionsByCountry.get(p.country_id) ?? new Set<string>();
      set.add(p.edition_id);
      editionsByCountry.set(p.country_id, set);
    });
    const pairs: { a: Country; b: Country; shared: number }[] = [];
    for (let i = 0; i < cList.length; i++) {
      for (let j = i + 1; j < cList.length; j++) {
        const setA = editionsByCountry.get(cList[i].id);
        const setB = editionsByCountry.get(cList[j].id);
        if (!setA || !setB) continue;
        let shared = 0;
        setA.forEach((id) => {
          if (setB.has(id)) shared++;
        });
        if (shared > 0) pairs.push({ a: cList[i], b: cList[j], shared });
      }
    }
    return pairs;
  }, [cList, participants]);

  const enriched = useMemo(
    () =>
      sharedPairs.map(({ a, b, shared }) => ({
        a,
        b,
        shared,
        rel: computeRelationship(a.id, b.id, { editions: editions ?? [], jury: jury ?? [], results: results ?? [] }),
      })),
    [sharedPairs, editions, jury, results],
  );

  const alliances = [...enriched].sort((x, y) => y.rel.friendshipScore - x.rel.friendshipScore).slice(0, 8);
  const rivalries = [...enriched].sort((x, y) => y.rel.rivalryScore - x.rel.rivalryScore).slice(0, 8);
  const mutual12s = enriched
    .filter((e) => e.rel.mutualTwelves > 0)
    .sort((x, y) => y.rel.mutualTwelves - x.rel.mutualTwelves)
    .slice(0, 8);

  const oneSidedRaw = relationships(jury ?? []).oneSided;
  const sharedKeySet = new Set(sharedPairs.map((p) => [p.a.id, p.b.id].sort().join("|")));
  const oneSided = oneSidedRaw
    .filter((o: { a: string; b: string; gap: number; ab: number; ba: number }) => sharedKeySet.has([o.a, o.b].sort().join("|")))
    .slice(0, 8)
    .map((o: { a: string; b: string; gap: number; ab: number; ba: number }) => ({ a: cMap.get(o.a), b: cMap.get(o.b), gap: o.gap, ab: o.ab, ba: o.ba }))
    .filter((o): o is { a: Country; b: Country; gap: number; ab: number; ba: number } => !!o.a && !!o.b);

  const filtered = enriched.filter(({ a, b }) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      b.name.toLowerCase().includes(q) ||
      a.short_code.toLowerCase().includes(q) ||
      b.short_code.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Voting diplomacy"
        title="Country relationships"
        description="Every pair of nations that has shared at least one SSC edition, ranked by friendship, rivalry and one-sided support."
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        <PairPanel
          title="Strongest alliances"
          description="Highest mutual point exchange"
          rows={alliances.map((e) => ({
            a: e.a,
            b: e.b,
            value: `${e.rel.friendshipScore.toFixed(0)} pts`,
            sub: `${e.rel.totalAtoB} ⇄ ${e.rel.totalBtoA} exchanged`,
          }))}
        />
        <PairPanel
          title="Biggest rivalries"
          description="Frequent close finishes & one-sided voting"
          rows={rivalries.map((e) => ({
            a: e.a,
            b: e.b,
            value: e.rel.rivalryScore.toFixed(0),
            sub: `${e.shared} shared edition${e.shared === 1 ? "" : "s"}`,
          }))}
        />
        <PairPanel
          title="Most one-sided relationships"
          description="Biggest gap between points given each way"
          rows={oneSided.map((o: { a: Country; b: Country; gap: number; ab: number; ba: number }) => ({ a: o.a, b: o.b, value: `+${o.gap} pts`, sub: `${o.ab} → vs ${o.ba} ←` }))}
        />
        <PairPanel
          title="Mutual 12-point admirers"
          description="Pairs that both awarded each other douze points"
          rows={mutual12s.map((e) => ({
            a: e.a,
            b: e.b,
            value: `${e.rel.mutualTwelves}× mutual 12`,
            sub: `${e.shared} shared edition${e.shared === 1 ? "" : "s"}`,
          }))}
        />
      </div>

      <Panel title="Browse every relationship" description="Search by country name or code" className="mt-4 sm:mt-6">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a country…"
          className="mb-4 w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ a, b, shared }) => (
            <Link
              key={`${a.id}-${b.id}`}
              to="/relationships/$pair"
              params={{ pair: pairParam(a, b) }}
              className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-strong"
            >
              <FlagChip code={a.short_code} color={a.accent_color} image={a.flag_image} size="sm" />
              <span className="truncate">{a.name}</span>
              <span className="text-muted-foreground">vs</span>
              <FlagChip code={b.short_code} color={b.accent_color} image={b.flag_image} size="sm" />
              <span className="truncate">{b.name}</span>
              <span className="numeric ml-auto shrink-0 text-xs text-muted-foreground">{shared}×</span>
            </Link>
          ))}
          {!filtered.length && (
            <p className="text-sm text-muted-foreground">No pairs match your search yet.</p>
          )}
        </div>
      </Panel>
    </AppShell>
  );
}

function PairPanel({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: { a: Country; b: Country; value: string; sub: string }[];
}) {
  return (
    <Panel title={title} description={description}>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i}>
              <Link
                to="/relationships/$pair"
                params={{ pair: pairParam(r.a, r.b) }}
                className="flex min-w-0 items-center gap-2 rounded-xl bg-surface px-3 py-2 transition-colors hover:bg-surface-strong sm:gap-3"
              >
                <FlagChip code={r.a.short_code} color={r.a.accent_color} image={r.a.flag_image} size="sm" />
                <FlagChip code={r.b.short_code} color={r.b.accent_color} image={r.b.flag_image} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {r.a.name} vs {r.b.name}
                </span>
                <span className="shrink-0 text-right">
                  <span className="numeric block text-sm font-semibold">{r.value}</span>
                  <span className="block text-[11px] text-muted-foreground">{r.sub}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Not enough data recorded yet.</p>
      )}
    </Panel>
  );
}

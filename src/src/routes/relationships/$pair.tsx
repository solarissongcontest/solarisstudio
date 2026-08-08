import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useCountries,
  useEditions,
} from "@/lib/data";
import { computeHeadToHead, computeRelationship } from "@/lib/stats";

export const Route = createFileRoute("/relationships/$pair")({
  head: ({ params }) => ({
    meta: [{ title: `${params.pair.replace(/-vs-/i, " vs ")} — Solaris Studio` }],
  }),
  component: RelationshipPairPage,
});

function RelationshipPairPage() {
  const { pair } = Route.useParams();
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: participants } = useAllParticipants();
  const { data: jury } = useAllJuryVotes();
  const { data: results } = useAllResults();

  const [codeA, codeB] = pair.toUpperCase().split("-VS-");
  const a = (countries ?? []).find((country) => country.short_code.toUpperCase() === codeA);
  const b = (countries ?? []).find((country) => country.short_code.toUpperCase() === codeB);

  if (!a || !b) {
    return (
      <AppShell>
        <PageHeader title="Relationship not found" />
        <Link to="/relationships" className="text-sm text-primary">
          ← Relationships
        </Link>
      </AppShell>
    );
  }

  const rel = computeRelationship(a.id, b.id, {
    editions: editions ?? [],
    jury: jury ?? [],
    results: results ?? [],
  });

  const h2h = computeHeadToHead(a.id, b.id, {
    editions: editions ?? [],
    results: results ?? [],
  });

  const aEditions = new Set(
    (participants ?? [])
      .filter((participant) => participant.country_id === a.id)
      .map((participant) => participant.edition_id),
  );

  const shared = [
    ...new Set(
      (participants ?? [])
        .filter(
          (participant) =>
            participant.country_id === b.id && aEditions.has(participant.edition_id),
        )
        .map((participant) => participant.edition_id),
    ),
  ]
    .map((id) => (editions ?? []).find((edition) => edition.id === id))
    .filter((edition): edition is NonNullable<typeof edition> => !!edition)
    .sort((x, y) => (y.year ?? 0) - (x.year ?? 0));

  const chartData = rel.timeline.map((point) => ({
    year: point.year,
    aToB: point.aToB,
    bToA: point.bToA,
  }));

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${shared.length} shared edition${shared.length === 1 ? "" : "s"}`}
        title={`${a.name} vs ${b.name}`}
        description="The essential head-to-head and voting relationship."
        actions={
          <Link
            to="/compare"
            search={{ a: a.short_code, b: b.short_code }}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          >
            Full comparison
          </Link>
        }
      />

      <Panel className="mb-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <CountryLink country={a} />
          <span className="text-xs uppercase tracking-wider text-muted-foreground">vs</span>
          <CountryLink country={b} align="right" />
        </div>
      </Panel>

      <Panel className="mb-5">
        <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
          <StatTile label="Shared editions" value={rel.participationsTogether} />
          <StatTile label="Friendship" value={rel.friendshipScore.toFixed(0)} />
          <StatTile label="Rivalry" value={rel.rivalryScore.toFixed(0)} />
          <StatTile label="Mutual 12s" value={rel.mutualTwelves} />
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Voting timeline">
          {chartData.length ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="year" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 14,
                    }}
                  />
                  <Line type="monotone" dataKey="aToB" name={`${a.short_code} → ${b.short_code}`} stroke="var(--jury)" strokeWidth={3} dot />
                  <Line type="monotone" dataKey="bToA" name={`${b.short_code} → ${a.short_code}`} stroke="var(--televote)" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No exchanged jury points yet.</p>
          )}
        </Panel>

        <Panel title="Head-to-head">
          <div className="divide-y divide-border/60">
            <Row label={`${a.name} finished higher`} value={h2h.aWins} />
            <Row label={`${b.name} finished higher`} value={h2h.bWins} />
            <Row label="Ties" value={h2h.ties} />
            <Row label="Average placement gap" value={h2h.avgDiff?.toFixed(1) ?? "—"} />
            <Row label={`${a.short_code} → ${b.short_code}`} value={`${rel.totalAtoB} pts`} />
            <Row label={`${b.short_code} → ${a.short_code}`} value={`${rel.totalBtoA} pts`} />
          </div>
        </Panel>

        <Panel title="Shared editions" className="lg:col-span-2">
          <div className="flex flex-wrap gap-2">
            {shared.map((edition) => (
              <Link
                key={edition.id}
                to="/editions/$slug"
                params={{ slug: edition.slug }}
                className="rounded-xl bg-surface px-3 py-2 text-xs hover:bg-surface-strong"
              >
                {editionLabel(edition)}
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

function CountryLink({
  country,
  align = "left",
}: {
  country: any;
  align?: "left" | "right";
}) {
  return (
    <Link
      to="/countries/$code"
      params={{ code: country.short_code }}
      className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}
    >
      <FlagChip
        code={country.short_code}
        color={country.accent_color}
        image={country.flag_image}
        size="md"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{country.name}</p>
        <p className="text-[11px] text-muted-foreground">{country.short_code}</p>
      </div>
    </Link>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="numeric text-sm font-semibold">{value}</span>
    </div>
  );
}

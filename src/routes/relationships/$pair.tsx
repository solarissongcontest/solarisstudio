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
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { computeCanonicalHeadToHead } from "@/lib/canonical-head-to-head";
import { useCompleteJuryArchive } from "@/lib/complete-jury";
import {
  editionLabel,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";
import { computeRelationship } from "@/lib/stats";

export const Route = createFileRoute("/relationships/$pair")({
  head: ({ params }) => ({
    meta: [{ title: `${params.pair.replace(/-vs-/i, " vs ")} — Solaris Studio` }],
  }),
  component: RelationshipPairPage,
});

function RelationshipPairPage() {
  const { pair } = Route.useParams();
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const participantsQuery = useAllParticipants();
  const juryQuery = useCompleteJuryArchive();
  const televoteQuery = useAllTelevotes();
  const resultsQuery = useAllResults();
  const showsQuery = useAllShows();
  const { data: countries } = countriesQuery;
  const { data: editions } = editionsQuery;
  const { data: participants } = participantsQuery;
  const { data: jury } = juryQuery;
  const { data: televote } = televoteQuery;
  const { data: results } = resultsQuery;
  const { data: shows } = showsQuery;

  const [codeA, codeB] = pair.toUpperCase().split("-VS-");
  const a = (countries ?? []).find((country) => country.short_code.toUpperCase() === codeA);
  const b = (countries ?? []).find((country) => country.short_code.toUpperCase() === codeB);

  const archiveQueries = [countriesQuery, editionsQuery, participantsQuery, juryQuery, televoteQuery, resultsQuery, showsQuery];
  if (archiveIsLoading(...archiveQueries)) return <AppShell><ArchiveDataLoading label="Loading relationship history…" /></AppShell>;
  if (archiveHasError(...archiveQueries)) return <AppShell><ArchiveDataError /></AppShell>;

  if (!a || !b) {
    return (
      <AppShell>
        <PageHeader title="Relationship not found" />
        <Link to="/relationships" className="text-sm text-primary">← Relationships</Link>
      </AppShell>
    );
  }

  const relationship = computeRelationship(a.id, b.id, {
    editions: editions ?? [],
    jury: jury ?? [],
    results: results ?? [],
    shows: shows ?? [],
  });

  const headToHead = computeCanonicalHeadToHead(a.id, b.id, {
    editions: editions ?? [],
    shows: shows ?? [],
    participants: participants ?? [],
    results: results ?? [],
    jury: jury ?? [],
    televote: televote ?? [],
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
          (participant) => participant.country_id === b.id && aEditions.has(participant.edition_id),
        )
        .map((participant) => participant.edition_id),
    ),
  ]
    .map((id) => (editions ?? []).find((edition) => edition.id === id))
    .filter((edition): edition is NonNullable<typeof edition> => !!edition)
    .sort((x, y) => (y.edition_number ?? -1) - (x.edition_number ?? -1));

  const chartData = relationship.timeline.map((point) => ({
    edition: point.label,
    editionNumber: point.editionNumber,
    aToB: point.normalizedAtoB,
    bToA: point.normalizedBtoA,
  }));

  return (
    <AppShell>
      <PageHeader
        eyebrow={`${shared.length} shared edition${shared.length === 1 ? "" : "s"}`}
        title={`${a.name} vs ${b.name}`}
        description="A statistical look at how these countries have performed together and supported each other in the published archive. The labels describe voting patterns, not intent or personal relationships."
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

      <Panel className="mb-5" title="Relationship score guide">
        <div className="grid gap-3 sm:grid-cols-3">
          <Guide title="Support score" text="Two-way support adjusted for how often both countries had a chance to vote for one another." />
          <Guide title="Reciprocity" text="How balanced that support is in both directions. A high number means the pattern is more mutual." />
          <Guide title="Sample confidence" text="How much shared voting history exists behind the score. More shared opportunities make the pattern more reliable." />
        </div>
      </Panel>

      <Panel className="mb-5">
        <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-4">
          <StatTile label="Shared editions" value={relationship.participationsTogether} />
          <StatTile label="Support score" value={relationship.friendshipScore.toFixed(0)} />
          <StatTile label="Reciprocity" value={relationship.reciprocityScore.toFixed(0)} />
          <StatTile
            label="Trend"
            value={relationship.relationshipTrend}
            hint={`${relationship.sampleConfidence} sample confidence`}
          />
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Support over time"
          description="Each direction is scaled against the maximum points available in that edition, so different voting systems can be compared more fairly."
        >
          {chartData.length ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="edition" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} domain={[0, 100]} />
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

        <Panel title="Head-to-head" description="Performance and voting numbers from editions where both countries appear in the archive.">
          <div className="divide-y divide-border/60">
            <Row label={`${a.name} finished higher`} value={headToHead.aWins} />
            <Row label={`${b.name} finished higher`} value={headToHead.bWins} />
            <Row label="Ties" value={headToHead.ties} />
            <Row label="Average placement gap" value={headToHead.avgDiff?.toFixed(1) ?? "—"} />
            <Row label={`${a.short_code} → ${b.short_code}`} value={`${relationship.totalAtoB} pts / ${relationship.expectedAtoB.toFixed(1)} expected`} />
            <Row label={`${b.short_code} → ${a.short_code}`} value={`${relationship.totalBtoA} pts / ${relationship.expectedBtoA.toFixed(1)} expected`} />
            <Row
              label={`${a.short_code} support frequency`}
              value={relationship.persistenceAtoB != null ? `${relationship.persistenceAtoB.toFixed(0)}%` : "—"}
            />
            <Row
              label={`${b.short_code} support frequency`}
              value={relationship.persistenceBtoA != null ? `${relationship.persistenceBtoA.toFixed(0)}%` : "—"}
            />
          </div>
        </Panel>

        <Panel
          title="Relationship milestones"
          description="Milestones are descriptive archive statistics. They are not evidence of coordinated voting."
          className="lg:col-span-2"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Milestone
              label="First top score"
              value={relationship.firstTopScore ? `SSC ${relationship.firstTopScore.editionNumber ?? "—"}` : "Not yet"}
            />
            <Milestone
              label="100 exchanged points"
              value={relationship.hundredPointMilestone != null ? `SSC ${relationship.hundredPointMilestone}` : "Not yet"}
            />
            <Milestone
              label="Longest support run"
              value={`${relationship.longestSupportRun} edition${relationship.longestSupportRun === 1 ? "" : "s"}`}
            />
          </div>
        </Panel>

        <Panel title="Shared editions" className="lg:col-span-2">
          {shared.length ? (
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
          ) : (
            <p className="text-sm text-muted-foreground">No shared editions.</p>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}

function CountryLink({ country, align = "left" }: { country: any; align?: "left" | "right" }) {
  return (
    <Link
      to="/countries/$code"
      params={{ code: country.short_code }}
      className={`flex min-w-0 items-center gap-3 ${align === "right" ? "flex-row-reverse text-right" : ""}`}
    >
      <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="md" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{country.name}</p>
        <p className="text-[11px] text-muted-foreground">{country.short_code}</p>
      </div>
    </Link>
  );
}

function Guide({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="text-xs font-semibold">{title}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
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

function Milestone({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="numeric mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

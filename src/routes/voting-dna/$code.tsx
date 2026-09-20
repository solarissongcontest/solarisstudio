import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import {
  editionLabel,
  useCountries,
  useEditions,
} from "@/lib/data";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
} from "@/lib/data-live";
import { buildPublicCountryArchive } from "@/lib/public-country-archive";

export const Route = createFileRoute("/voting-dna/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.code.toUpperCase()} Voting DNA — Solaris Studio` },
      {
        name: "description",
        content: "Descriptive voting and result patterns based only on published Solaris Song Contest data.",
      },
    ],
  }),
  component: VotingDnaPage,
});

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function VotingDnaPage() {
  const { code } = Route.useParams();
  const feature = useQuery({
    queryKey: ["studio2-feature", "country_voting_dna"],
    queryFn: () => isStudio2FeatureEnabled("country_voting_dna"),
    staleTime: 30_000,
  });
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const participantsQuery = useAllParticipants();
  const resultsQuery = useAllResults();
  const juryQuery = useAllJuryVotes();
  const televoteQuery = useAllTelevotes();

  const archive = useMemo(
    () =>
      buildPublicCountryArchive({
        editions: editionsQuery.data ?? [],
        shows: showsQuery.data ?? [],
        participants: participantsQuery.data ?? [],
        results: resultsQuery.data ?? [],
        jury: juryQuery.data ?? [],
        televote: televoteQuery.data ?? [],
      }),
    [
      editionsQuery.data,
      showsQuery.data,
      participantsQuery.data,
      resultsQuery.data,
      juryQuery.data,
      televoteQuery.data,
    ],
  );

  if (
    feature.isLoading ||
    archiveIsLoading(
      countriesQuery,
      editionsQuery,
      showsQuery,
      participantsQuery,
      resultsQuery,
      juryQuery,
      televoteQuery,
    )
  ) {
    return <AppShell><PageHeader eyebrow="Published analysis" title="Voting DNA" description="Building a descriptive country profile…" /><ArchiveDataLoading /></AppShell>;
  }
  if (feature.data === false) {
    return <AppShell><PageHeader eyebrow="Published analysis" title="Voting DNA" description="Country voting patterns." /><Panel title="Voting DNA is not enabled yet"><p className="text-sm text-muted-foreground">The product is installed but remains behind its rollout flag during verification.</p></Panel></AppShell>;
  }
  if (archiveHasError(countriesQuery, editionsQuery, showsQuery, participantsQuery, resultsQuery, juryQuery, televoteQuery)) {
    return <AppShell><ArchiveDataError /></AppShell>;
  }

  const country = (countriesQuery.data ?? []).find(
    (row) => row.short_code.toUpperCase() === code.toUpperCase(),
  );
  if (!country) {
    return <AppShell><Panel title="Country not found"><Link to="/countries" className="text-sm text-primary">← Countries</Link></Panel></AppShell>;
  }

  const countryMap = new Map((countriesQuery.data ?? []).map((row) => [row.id, row]));
  const editionMap = new Map(archive.editions.map((row) => [row.id, row]));
  const given = archive.jury.filter((row) => row.voter_country_id === country.id);
  const received = archive.jury.filter((row) => row.receiving_country_id === country.id);
  const results = archive.results.filter((row) => row.country_id === country.id);

  const aggregate = (rows: typeof given, field: "receiving_country_id" | "voter_country_id") => {
    const byCountry = new Map<string, { points: number; ballots: number }>();
    for (const row of rows) {
      const id = row[field];
      if (!id) continue;
      const current = byCountry.get(id) ?? { points: 0, ballots: 0 };
      current.points += row.points;
      current.ballots += 1;
      byCountry.set(id, current);
    }
    return [...byCountry.entries()]
      .map(([id, value]) => ({ country: countryMap.get(id), ...value }))
      .filter((row): row is typeof row & { country: NonNullable<typeof row.country> } => Boolean(row.country))
      .sort((a, b) => b.points - a.points)
      .slice(0, 10);
  };

  const topGiven = aggregate(given, "receiving_country_id");
  const topReceived = aggregate(received, "voter_country_id");
  const editionRows = [...new Set(results.map((row) => row.edition_id))]
    .map((editionId) => {
      const candidates = results.filter((row) => row.edition_id === editionId);
      const best = candidates.sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))[0];
      const edition = editionMap.get(editionId);
      return best && edition ? { edition, result: best } : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => (b.edition.edition_number ?? -1) - (a.edition.edition_number ?? -1));

  const juryValues = editionRows.map((row) => row.result.jury_points);
  const teleValues = editionRows.map((row) => row.result.televote_points);
  const detailedEditions = new Set([...given, ...received].map((row) => row.edition_id)).size;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Published analysis"
        title={`${country.name} Voting DNA`}
        description="A descriptive profile of published voting and result history. Patterns are context, not evidence of coordination or wrongdoing."
        actions={<Link to="/countries/$code" params={{ code: country.short_code }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold">Country profile →</Link>}
      />

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
        <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="md" />
        <div>
          <p className="font-semibold">{country.name}</p>
          <p className="text-xs text-muted-foreground">{country.region} · {country.short_code}</p>
        </div>
      </div>

      <Panel title="Sample" description="The sample changes when Solaris has not published detailed ballots for an older show.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Detailed editions" value={detailedEditions} />
          <StatTile label="Jury points given" value={given.reduce((sum, row) => sum + row.points, 0)} />
          <StatTile label="Jury points received" value={received.reduce((sum, row) => sum + row.points, 0)} />
          <StatTile label="Result editions" value={editionRows.length} />
        </div>
      </Panel>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Panel title="Most supported" description="Countries receiving the most published jury points from this country.">
          <SupportList rows={topGiven} />
        </Panel>
        <Panel title="Strongest received support" description="Countries that have given this country the most published jury points.">
          <SupportList rows={topReceived} />
        </Panel>
      </div>

      <Panel title="Jury and televote result profile" description="Aggregate result totals, kept separate rather than flattened into fake precision." className="mt-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Avg jury points" value={average(juryValues)?.toFixed(1) ?? "—"} />
          <StatTile label="Avg televote points" value={average(teleValues)?.toFixed(1) ?? "—"} />
          <StatTile label="Best jury total" value={juryValues.length ? Math.max(...juryValues) : "—"} />
          <StatTile label="Best televote total" value={teleValues.length ? Math.max(...teleValues) : "—"} />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="pb-2">Edition</th><th className="pb-2">Rank</th><th className="pb-2">Jury</th><th className="pb-2">Televote</th><th className="pb-2">Total</th></tr>
            </thead>
            <tbody>
              {editionRows.map(({ edition, result }) => (
                <tr key={edition.id} className="border-t border-border/60">
                  <td className="py-2.5 font-semibold">{editionLabel(edition)}</td>
                  <td className="py-2.5 tabular-nums">{result.final_rank ?? "—"}</td>
                  <td className="py-2.5 tabular-nums">{result.jury_points}</td>
                  <td className="py-2.5 tabular-nums">{result.televote_points}</td>
                  <td className="py-2.5 tabular-nums">{result.total_points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Methodology" className="mt-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Voting DNA uses only editions, shows, results and detailed ballots that the normal public publication layer already permits. Jury and televote totals are shown separately. Directional support uses detailed jury ballots because Solaris does not pretend aggregate televote totals identify individual voter-country relationships. Missing historical detail is excluded, and sample counts are shown above.
        </p>
      </Panel>
    </AppShell>
  );
}

function SupportList({
  rows,
}: {
  rows: Array<{ country: { id: string; short_code: string; name: string; flag_image: string | null; accent_color: string }; points: number; ballots: number }>;
}) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No published detailed ballot sample is available.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <Link key={row.country.id} to="/voting-dna/$code" params={{ code: row.country.short_code }} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/30 p-3">
          <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
          <FlagChip code={row.country.short_code} color={row.country.accent_color} image={row.country.flag_image} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.country.name}</span>
          <span className="text-right text-xs tabular-nums"><strong>{row.points}</strong><br/><span className="text-muted-foreground">{row.ballots} rows</span></span>
        </Link>
      ))}
    </div>
  );
}

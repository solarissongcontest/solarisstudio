import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  DataStoryPage,
  MethodologyDisclosure,
  ResponsiveHistory,
  StatSummary,
  type PublicDataColumn,
} from "@/components/public/PublicDataStory";
import { editionLabel, useCountries, useEditions } from "@/lib/data";
import { loadV3PublicVotingDna } from "@/lib/v3-public-voting-dna";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import {
  VOTING_DNA_PRESENTATION_FORMULA_VERSION,
  averagePublishedTotals,
  getVotingDnaAvailability,
} from "@/lib/v3-voting-dna";

export const Route = createFileRoute("/voting-dna/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.code.toUpperCase()} Voting DNA — Solaris Studio` },
      {
        name: "description",
        content:
          "Descriptive voting and result patterns based only on published Solaris Song Contest data.",
      },
    ],
  }),
  component: VotingDnaPage,
});

function VotingDnaPage() {
  const { code } = Route.useParams();
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const country = (countriesQuery.data ?? []).find(
    (row) => row.short_code.toUpperCase() === code.toUpperCase(),
  );

  const feature = useQuery({
    queryKey: ["studio2-feature", "country_voting_dna"],
    queryFn: () => isStudio2FeatureEnabled("country_voting_dna"),
    staleTime: 30_000,
  });

  const dna = useQuery({
    enabled: feature.data === true && Boolean(country?.id),
    queryKey: ["v3-public-country-voting-dna", country?.id],
    queryFn: () => loadV3PublicVotingDna(country!.id),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const countryMap = useMemo(
    () => new Map((countriesQuery.data ?? []).map((row) => [row.id, row])),
    [countriesQuery.data],
  );
  const editionMap = useMemo(
    () => new Map((editionsQuery.data ?? []).map((row) => [row.id, row])),
    [editionsQuery.data],
  );

  if (feature.isLoading || countriesQuery.isLoading || editionsQuery.isLoading) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Published analysis"
          title="Voting DNA"
          description="Loading the country profile…"
        />
        <Panel>
          <p className="text-sm text-muted-foreground">Loading published country data…</p>
        </Panel>
      </AppShell>
    );
  }

  if (feature.isError || feature.data !== true) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Published analysis"
          title="Voting DNA"
          description="Country voting patterns."
        />
        <Panel title="Voting DNA is not enabled yet">
          <p className="text-sm text-muted-foreground">
            The product is installed but remains behind its rollout flag during verification.
          </p>
        </Panel>
      </AppShell>
    );
  }

  if (!country) {
    return (
      <AppShell>
        <Panel title="Country not found">
          <Link to="/countries" className="text-sm text-primary">
            ← Countries
          </Link>
        </Panel>
      </AppShell>
    );
  }

  if (dna.isLoading) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Published analysis"
          title={`${country.name} Voting DNA`}
          description="Building a publication-safe aggregate profile…"
        />
        <Panel>
          <p className="text-sm text-muted-foreground">Loading published voting aggregates…</p>
        </Panel>
      </AppShell>
    );
  }

  if (dna.isError || !dna.data) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Published analysis"
          title={`${country.name} Voting DNA`}
          description="Country voting patterns."
        />
        <Panel title="Voting DNA is temporarily unavailable">
          <p className="text-sm text-muted-foreground" role="status">
            Solaris could not load a publication-safe Voting DNA projection. Hidden Jury or
            Televote layers are never reconstructed from the older aggregate response.
          </p>
        </Panel>
      </AppShell>
    );
  }

  const availability = getVotingDnaAvailability(dna.data);

  if (!availability.hasAnyPublishedData) {
    return (
      <AppShell>
        <PageHeader
          eyebrow="Published analysis"
          title={`${country.name} Voting DNA`}
          description="A descriptive profile built only from published voting and result history."
          actions={
            <Link
              to="/countries/$code"
              params={{ code: country.short_code }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
            >
              Country profile →
            </Link>
          }
        />
        <DataStoryPage>
          <Panel
            title="Not enough data yet"
            description="Solaris does not yet have a published detailed-voting or result sample for this country."
          >
            <p className="text-sm text-muted-foreground" role="status">
              Voting DNA does not estimate missing history or turn unpublished contest data into a
              pattern. This profile will populate as publication-safe source data becomes available.
            </p>
          </Panel>
          <MethodologyDisclosure title="Methodology">
            Voting DNA uses only published editions, published result layers and detailed jury
            voting that the relevant show has made public. Missing historical detail is excluded
            rather than inferred.
          </MethodologyDisclosure>
        </DataStoryPage>
      </AppShell>
    );
  }

  const topGiven = dna.data.topGiven
    .map((row) => ({ ...row, country: countryMap.get(row.countryId) }))
    .filter((row): row is typeof row & { country: NonNullable<typeof row.country> } =>
      Boolean(row.country),
    );
  const topReceived = dna.data.topReceived
    .map((row) => ({ ...row, country: countryMap.get(row.countryId) }))
    .filter((row): row is typeof row & { country: NonNullable<typeof row.country> } =>
      Boolean(row.country),
    );

  const editionRows = dna.data.results
    .map((result) => ({ result, edition: editionMap.get(result.editionId) }))
    .filter((row): row is typeof row & { edition: NonNullable<typeof row.edition> } =>
      Boolean(row.edition),
    );

  const juryValues = editionRows.flatMap((row) =>
    row.result.juryPublished && row.result.juryPoints !== null
      ? [row.result.juryPoints]
      : [],
  );
  const teleValues = editionRows.flatMap((row) =>
    row.result.televotePublished && row.result.televotePoints !== null
      ? [row.result.televotePoints]
      : [],
  );
  const historyColumns = [
    {
      key: "edition",
      header: "Edition",
      primary: true,
      render: (row) => editionLabel(row.edition),
    },
    {
      key: "rank",
      header: "Rank",
      render: (row) => <span className="tabular-nums">{row.result.finalRank ?? "—"}</span>,
    },
    {
      key: "jury",
      header: "Jury",
      align: "right" as const,
      render: (row) =>
        row.result.juryPublished && row.result.juryPoints !== null ? (
          <span className="tabular-nums">{row.result.juryPoints}</span>
        ) : (
          <span className="text-muted-foreground">Not public</span>
        ),
    },
    {
      key: "televote",
      header: "Televote",
      align: "right" as const,
      render: (row) =>
        row.result.televotePublished && row.result.televotePoints !== null ? (
          <span className="tabular-nums">{row.result.televotePoints}</span>
        ) : (
          <span className="text-muted-foreground">Not public</span>
        ),
    },
    {
      key: "total",
      header: "Total",
      align: "right" as const,
      render: (row) => <span className="tabular-nums font-semibold">{row.result.totalPoints}</span>,
    },
  ] satisfies readonly PublicDataColumn<(typeof editionRows)[number]>[];

  const limitedSample =
    availability.limitedDetailedSample || availability.limitedResultSample;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Published analysis"
        title={`${country.name} Voting DNA`}
        description="A descriptive profile of published voting and result history. Patterns are context, not evidence of coordination or wrongdoing."
        actions={
          <Link
            to="/countries/$code"
            params={{ code: country.short_code }}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold"
          >
            Country profile →
          </Link>
        }
      />

      <DataStoryPage>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          <FlagChip
            code={country.short_code}
            color={country.accent_color}
            image={country.flag_image}
            size="md"
          />
          <div>
            <p className="font-semibold">{country.name}</p>
            <p className="text-xs text-muted-foreground">
              {country.region} · {country.short_code}
            </p>
          </div>
        </div>

        <Panel
          title="Published sample"
          description={
            limitedSample
              ? "Limited sample: treat these published totals as context, not as a stable long-term pattern."
              : "Only editions and voting layers already published for public viewing are included."
          }
        >
          <StatSummary>
            <StatTile label="Detailed editions" value={dna.data.sample.detailedEditions} />
            <StatTile label="Jury points given" value={dna.data.sample.givenPoints} />
            <StatTile label="Jury points received" value={dna.data.sample.receivedPoints} />
            <StatTile label="Result editions" value={dna.data.sample.resultEditions} />
          </StatSummary>
        </Panel>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Panel
            title="Most supported"
            description="Countries receiving the most published jury points from this country."
          >
            <SupportList rows={topGiven} />
          </Panel>
          <Panel
            title="Strongest received support"
            description="Countries that have given this country the most published jury points."
          >
            <SupportList rows={topReceived} />
          </Panel>
        </div>

        <Panel
          title="Jury and televote result profile"
          description="Each split result appears only when that exact result layer is public. Combined totals and ranks do not make hidden Jury or Televote values public."
          className="mt-5"
        >
          {availability.hasResultSample && editionRows.length ? (
            <>
              <StatSummary>
                <StatTile
                  label="Avg jury points"
                  value={averagePublishedTotals(juryValues)?.toFixed(1) ?? "—"}
                />
                <StatTile
                  label="Avg televote points"
                  value={averagePublishedTotals(teleValues)?.toFixed(1) ?? "—"}
                />
                <StatTile
                  label="Best jury total"
                  value={juryValues.length ? Math.max(...juryValues) : "—"}
                />
                <StatTile
                  label="Best televote total"
                  value={teleValues.length ? Math.max(...teleValues) : "—"}
                />
              </StatSummary>

              <ResponsiveHistory
                className="mt-5"
                rows={editionRows}
                columns={historyColumns}
                rowKey={(row) => row.edition.id}
                ariaLabel={`${country.name} published result history`}
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground" role="status">
              Not enough result data yet. No published result history is available for this
              country.
            </p>
          )}
        </Panel>

        <MethodologyDisclosure title="Methodology">
          Voting DNA uses the publication-safe server aggregate formula {dna.data.formulaVersion}.
          Directional support is built only from detailed jury vote rows that the relevant show has
          published. Combined Result publication may expose rank and total points, but Jury and
          Televote point totals remain independently hidden until their own publication layers are
          public. The displayed Jury and Televote averages use presentation formula {" "}
          {VOTING_DNA_PRESENTATION_FORMULA_VERSION}: the arithmetic mean of only the split totals
          actually released in the rows shown above. Missing historical detail is excluded rather
          than estimated, and the sample counts above show the historical scope of the available
          evidence.
        </MethodologyDisclosure>
      </DataStoryPage>
    </AppShell>
  );
}

function SupportList({
  rows,
}: {
  rows: Array<{
    country: {
      id: string;
      short_code: string;
      name: string;
      flag_image: string | null;
      accent_color: string;
    };
    points: number;
    ballots: number;
  }>;
}) {
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Not enough detailed voting data yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <Link
          key={row.country.id}
          to="/voting-dna/$code"
          params={{ code: row.country.short_code }}
          className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/30 p-3"
        >
          <span className="w-5 text-xs tabular-nums text-muted-foreground">{index + 1}</span>
          <FlagChip
            code={row.country.short_code}
            color={row.country.accent_color}
            image={row.country.flag_image}
            size="sm"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {row.country.name}
          </span>
          <span className="text-right text-xs tabular-nums">
            <strong>{row.points}</strong>
            <br />
            <span className="text-muted-foreground">
              {row.ballots} published {row.ballots === 1 ? "vote row" : "vote rows"}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}

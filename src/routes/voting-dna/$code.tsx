import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell, PageHeader, Panel, StatTile } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { supabase } from "@/integrations/supabase/client";
import { editionLabel, useCountries, useEditions } from "@/lib/data";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

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

type VotingDnaAggregate = {
  sample: {
    detailedEditions: number;
    givenPoints: number;
    receivedPoints: number;
    resultEditions: number;
  };
  topGiven: Array<{ countryId: string; points: number; ballots: number }>;
  topReceived: Array<{ countryId: string; points: number; ballots: number }>;
  results: Array<{
    editionId: string;
    showId: string;
    finalRank: number | null;
    juryPoints: number;
    televotePoints: number;
    totalPoints: number;
  }>;
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

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
    queryKey: ["country-voting-dna", country?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("public_country_voting_dna", {
        _country_id: country!.id,
      });
      if (error) throw error;
      return data as VotingDnaAggregate;
    },
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
        <Panel title="Voting DNA could not be loaded">
          <p className="text-sm text-muted-foreground">
            Published voting aggregates are temporarily unavailable.
          </p>
        </Panel>
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

  const juryValues = editionRows.map((row) => row.result.juryPoints);
  const teleValues = editionRows.map((row) => row.result.televotePoints);

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

      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
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
        title="Sample"
        description="The sample changes when Solaris has not published detailed ballots for an older show."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Detailed editions" value={dna.data.sample.detailedEditions} />
          <StatTile label="Jury points given" value={dna.data.sample.givenPoints} />
          <StatTile label="Jury points received" value={dna.data.sample.receivedPoints} />
          <StatTile label="Result editions" value={dna.data.sample.resultEditions} />
        </div>
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
        description="Aggregate result totals, kept separate rather than flattened into fake precision."
        className="mt-5"
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Avg jury points" value={average(juryValues)?.toFixed(1) ?? "—"} />
          <StatTile
            label="Avg televote points"
            value={average(teleValues)?.toFixed(1) ?? "—"}
          />
          <StatTile
            label="Best jury total"
            value={juryValues.length ? Math.max(...juryValues) : "—"}
          />
          <StatTile
            label="Best televote total"
            value={teleValues.length ? Math.max(...teleValues) : "—"}
          />
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="pb-2">Edition</th>
                <th className="pb-2">Rank</th>
                <th className="pb-2">Jury</th>
                <th className="pb-2">Televote</th>
                <th className="pb-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {editionRows.map(({ edition, result }) => (
                <tr key={edition.id} className="border-t border-border/60">
                  <td className="py-2.5 font-semibold">{editionLabel(edition)}</td>
                  <td className="py-2.5 tabular-nums">{result.finalRank ?? "—"}</td>
                  <td className="py-2.5 tabular-nums">{result.juryPoints}</td>
                  <td className="py-2.5 tabular-nums">{result.televotePoints}</td>
                  <td className="py-2.5 tabular-nums">{result.totalPoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Methodology" className="mt-5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          Voting DNA uses a compact database aggregate over published editions, result layers and
          detailed jury ballots. Jury and televote totals remain separate. Directional support uses
          detailed jury ballots because aggregate televote totals do not identify individual
          voter-country relationships. Missing historical detail is excluded, and the sample counts
          above show how much published evidence exists.
        </p>
      </Panel>
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
      <p className="text-sm text-muted-foreground">
        No published detailed ballot sample is available.
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
            <span className="text-muted-foreground">{row.ballots} rows</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { useCountries } from "@/lib/data";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

export const Route = createFileRoute("/voting-dna/")({
  head: () => ({
    meta: [
      { title: "Country Voting DNA — Solaris Studio" },
      {
        name: "description",
        content: "Choose a country to explore descriptive voting and result patterns from published SSC data.",
      },
    ],
  }),
  component: VotingDnaIndexPage,
});

function VotingDnaIndexPage() {
  const { data: countries = [], isLoading } = useCountries();
  const [query, setQuery] = useState("");
  const feature = useQuery({
    queryKey: ["studio2-feature", "country_voting_dna"],
    queryFn: () => isStudio2FeatureEnabled("country_voting_dna"),
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return countries
      .filter((country) =>
        !needle ||
        [country.name, country.native_name, country.short_code, country.region]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, query]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Published analysis"
        title="Country Voting DNA"
        description="Choose a delegation to explore its published jury relationships and jury/televote result profile. This is descriptive analysis, not an integrity verdict."
      />

      {feature.isLoading || isLoading ? (
        <Panel><p className="text-sm text-muted-foreground">Loading country index…</p></Panel>
      ) : feature.isError || feature.data !== true ? (
        <Panel title="Voting DNA is not enabled yet">
          <p className="text-sm text-muted-foreground">
            The product is installed but remains behind its rollout flag during verification.
          </p>
        </Panel>
      ) : (
        <>
          <label className="relative mb-4 block">
            <span className="sr-only">Search countries</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search countries"
              className="min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm outline-none focus:border-primary/50"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((country) => (
              <Link
                key={country.id}
                to="/voting-dna/$code"
                params={{ code: country.short_code }}
                className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-primary/35"
              >
                <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{country.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{country.region} · {country.short_code}</span>
                </span>
                <span aria-hidden className="text-primary">→</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

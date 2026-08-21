import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { PublicOverview } from "@/components/PublicOverview";
import { useAllParticipants, useCountries } from "@/lib/data";

export const Route = createFileRoute("/countries")({
  component: CountriesRoot,
});

function CountriesRoot() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });
  const exactRoot = location.pathname === "/countries" || location.pathname === "/countries/";
  const view = (location.search as Record<string, unknown> | undefined)?.view;

  if (!exactRoot || view === "directory") return <Outlet />;
  return <CountriesOverview />;
}

function CountriesOverview() {
  const { data: countries } = useCountries();
  const { data: participants } = useAllParticipants();

  const regions = new Set((countries ?? []).map((country) => country.region).filter(Boolean));
  const participatingCountries = new Set((participants ?? []).map((entry) => entry.country_id));

  return (
    <PublicOverview
      eyebrow="Countries overview"
      title="Countries"
      description="Start with the Solaris delegation map, then browse the full directory or open the specialist comparison and record tools."
      highlights={[
        { label: "Delegations", value: countries?.length ?? 0 },
        { label: "Regions", value: regions.size },
        { label: "With SSC history", value: participatingCountries.size },
        { label: "Directory", value: "A–Z", hint: "Artist and song search included" },
      ]}
      discover={[
        {
          title: "Browse every delegation",
          description: "Search countries, artists and songs, filter by region and sort the archive.",
          href: "/countries?view=directory",
          eyebrow: "Directory",
        },
        {
          title: "Read country stories",
          description: "Open Terra Solaris Wiki profiles for national information and SSC history.",
          href: "/wiki",
          eyebrow: "Wiki",
        },
        {
          title: "See all-time records",
          description: "Find wins, milestones and the strongest records across the archive.",
          href: "/records",
          eyebrow: "Records",
        },
      ]}
      deepDive={[
        {
          title: "Compare two countries",
          description: "Put two delegations side by side across results and voting history.",
          href: "/compare",
          eyebrow: "Comparison",
        },
        {
          title: "Voting relationships",
          description: "Inspect repeated support and similarity patterns between countries.",
          href: "/relationships",
          eyebrow: "Relationships",
        },
        {
          title: "Results analysis",
          description: "Move from country records into jury, televote and historical analysis.",
          href: "/analysis",
          eyebrow: "Analysis",
        },
      ]}
    />
  );
}

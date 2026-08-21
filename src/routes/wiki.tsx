import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { PublicOverview } from "@/components/PublicOverview";
import { useCountries } from "@/lib/data";

export const Route = createFileRoute("/wiki")({
  component: WikiRoot,
});

function WikiRoot() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });
  const exactRoot = location.pathname === "/wiki" || location.pathname === "/wiki/";
  const view = (location.search as Record<string, unknown> | undefined)?.view;

  if (!exactRoot || view === "library") return <Outlet />;
  return <WikiOverview />;
}

function WikiOverview() {
  const { data: countries } = useCountries();
  const regions = new Set((countries ?? []).map((country) => country.region).filter(Boolean));
  const withNativeName = (countries ?? []).filter(
    (country) => country.native_name && country.native_name !== country.name,
  ).length;

  return (
    <PublicOverview
      eyebrow="Wiki overview"
      title="Terra Solaris Wiki"
      description="The national side of Solaris in one place. Start with the country library, then move into individual national profiles and their contest history."
      highlights={[
        { label: "Country articles", value: countries?.length ?? 0 },
        { label: "Regions", value: regions.size },
        { label: "Native names", value: withNativeName },
        { label: "Profile type", value: "National", hint: "Linked with SSC country history" },
      ]}
      discover={[
        {
          title: "Browse the Wiki library",
          description: "Search every country article by country name, native name or code.",
          href: "/wiki?view=library",
          eyebrow: "Library",
        },
        {
          title: "Browse SSC countries",
          description: "Switch to the contest-focused delegation directory and performance records.",
          href: "/countries",
          eyebrow: "Countries",
        },
        {
          title: "See recent Solaris activity",
          description: "Follow entry reveals, national finals, results and other public changes.",
          href: "/pulse",
          eyebrow: "Pulse",
        },
      ]}
      deepDive={[
        {
          title: "Compare countries",
          description: "Put two countries side by side when the Wiki makes you curious about their SSC records.",
          href: "/compare",
          eyebrow: "Comparison",
        },
        {
          title: "Explore records",
          description: "Open all-time milestones and contest records across the Solaris archive.",
          href: "/records",
          eyebrow: "Records",
        },
        {
          title: "Open Analysis",
          description: "Use voting and result analysis when you want more than an article overview.",
          href: "/analysis",
          eyebrow: "Analysis",
        },
      ]}
    />
  );
}

import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { PublicOverview } from "@/components/PublicOverview";
import { useAllResults, useAllShows, useCountries, useEditions } from "@/lib/data";

export const Route = createFileRoute("/records")({
  component: RecordsRoot,
});

function RecordsRoot() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });
  const exactRoot = location.pathname === "/records" || location.pathname === "/records/";
  const view = (location.search as Record<string, unknown> | undefined)?.view;

  if (!exactRoot || view === "archive") return <Outlet />;
  return <RecordsOverview />;
}

function RecordsOverview() {
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: results } = useAllResults();

  const finalShowIds = new Set(
    (shows ?? [])
      .filter((show) => show.kind === "grand-final" || show.kind === "final")
      .map((show) => show.id),
  );
  const archivedFinals = new Set(
    (results ?? [])
      .filter((row) => row.show_id && finalShowIds.has(row.show_id))
      .map((row) => row.edition_id),
  );

  return (
    <PublicOverview
      eyebrow="Records overview"
      title="Records"
      description="Start with what the archive can tell you, then browse every record category or jump into the tools that explain how those records happened."
      highlights={[
        { label: "Countries", value: countries?.length ?? 0 },
        { label: "Editions", value: editions?.length ?? 0 },
        { label: "Finals archived", value: archivedFinals.size },
        { label: "Categories", value: 6, hint: "Career, streaks, edition, voting, regional and unusual" },
      ]}
      discover={[
        {
          title: "Browse all records",
          description: "Open the full record library with category filters, tied holders and archive context.",
          href: "/records?view=archive",
          eyebrow: "Record library",
        },
        {
          title: "Play Archive Games",
          description: "Turn Solaris history into interactive archive challenges instead of another table.",
          href: "/archive-games",
          eyebrow: "Games",
        },
        {
          title: "Browse countries",
          description: "Open a record holder's wider delegation history and national profile.",
          href: "/countries",
          eyebrow: "Countries",
        },
      ]}
      deepDive={[
        {
          title: "Open Analysis",
          description: "Explain record-breaking results through jury, televote and historical patterns.",
          href: "/analysis",
          eyebrow: "Analysis",
        },
        {
          title: "Compare countries",
          description: "Put two record holders side by side across their contest histories.",
          href: "/compare",
          eyebrow: "Comparison",
        },
        {
          title: "Open Results",
          description: "Trace a record back to the published scoreboard that produced it.",
          href: "/results",
          eyebrow: "Results",
        },
      ]}
    />
  );
}

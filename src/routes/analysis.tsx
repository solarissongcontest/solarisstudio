import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { PublicOverview } from "@/components/PublicOverview";
import { useAllJuryVotes, useAllResults, useCountries, useEditions } from "@/lib/data";

export const Route = createFileRoute("/analysis")({
  component: AnalysisRoot,
});

function AnalysisRoot() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });
  const exactRoot = location.pathname === "/analysis" || location.pathname === "/analysis/";
  const view = (location.search as Record<string, unknown> | undefined)?.view;

  if (!exactRoot || view === "tools") return <Outlet />;
  return <AnalysisOverview />;
}

function AnalysisOverview() {
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();

  const resultShows = new Set((results ?? []).map((row) => row.show_id).filter(Boolean));

  return (
    <PublicOverview
      eyebrow="Analysis overview"
      title="Analysis"
      description="Start with the questions the data can answer. The large charts, filters and voting matrices are still available, but they no longer have to greet everyone at the door."
      highlights={[
        { label: "Countries", value: countries?.length ?? 0 },
        { label: "Editions", value: editions?.length ?? 0 },
        { label: "Result sets", value: resultShows.size },
        { label: "Jury votes", value: jury?.length ?? 0 },
      ]}
      discover={[
        {
          title: "What did I miss in the results?",
          description: "Open automatically detected climbs, collapses, close margins and interesting voting stories.",
          href: "/analysis?view=tools",
          eyebrow: "Discover",
        },
        {
          title: "Where did jury and televote disagree?",
          description: "Compare the two voting halves and see which countries each side preferred most.",
          href: "/analysis?view=tools",
          eyebrow: "Jury vs televote",
        },
        {
          title: "Which countries keep finding each other?",
          description: "Explore repeated support, voting twins and one-sided relationships.",
          href: "/relationships",
          eyebrow: "Relationships",
        },
      ]}
      deepDive={[
        {
          title: "Open the full Analysis workspace",
          description: "Use filters, heat maps, history, support rankings, relationship views and the full archive toolset.",
          href: "/analysis?view=tools",
          eyebrow: "Full workspace",
        },
        {
          title: "Run Result Lab",
          description: "Change jury and televote weighting or remove juries without altering official results.",
          href: "/result-lab",
          eyebrow: "Simulation",
        },
        {
          title: "Compare countries",
          description: "Use a focused two-country comparison instead of scanning the whole archive.",
          href: "/compare",
          eyebrow: "Comparison",
        },
      ]}
    />
  );
}

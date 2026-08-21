import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { PublicOverview } from "@/components/PublicOverview";
import { useAllShows, useEditions } from "@/lib/data";
import { isShowPublic } from "@/lib/publication";

export const Route = createFileRoute("/editions")({
  component: EditionsRoot,
});

function EditionsRoot() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });
  const exactRoot = location.pathname === "/editions" || location.pathname === "/editions/";
  const view = (location.search as Record<string, unknown> | undefined)?.view;

  if (!exactRoot || view === "archive") return <Outlet />;
  return <EditionsOverview />;
}

function EditionsOverview() {
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const publicEditions = (editions ?? []).filter((edition) => edition.published);
  const activeEdition = [...publicEditions]
    .sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0];
  const publicShows = (shows ?? []).filter(isShowPublic);

  return (
    <PublicOverview
      eyebrow="Editions overview"
      title="Editions"
      description="Start with the current Solaris era, then browse the full contest archive or open results and analysis when you need the details."
      highlights={[
        { label: "Published editions", value: publicEditions.length },
        { label: "Public shows", value: publicShows.length },
        { label: "Current", value: activeEdition?.edition_number != null ? `SSC ${activeEdition.edition_number}` : "—" },
        { label: "Archive", value: "Full", hint: "Shows, entries and published results" },
      ]}
      discover={[
        {
          title: "Browse the edition archive",
          description: "Open every published edition and its hero, entries, shows and available results.",
          href: "/editions?view=archive",
          eyebrow: "Archive",
        },
        {
          title: "See published results",
          description: "Go straight to the result overview when the scoreboard matters more than the edition page.",
          href: "/results",
          eyebrow: "Results",
        },
        {
          title: "Explore countries",
          description: "Follow an edition through the delegations that competed in it.",
          href: "/countries",
          eyebrow: "Countries",
        },
      ]}
      deepDive={[
        {
          title: "Open Analysis",
          description: "Compare jury, televote, relationships and historical patterns across editions.",
          href: "/analysis",
          eyebrow: "Analysis",
        },
        {
          title: "Open Records",
          description: "See all-time milestones and records built from the archived editions.",
          href: "/records",
          eyebrow: "Records",
        },
        {
          title: "Run Result Lab",
          description: "Experiment with result weighting without changing any official score.",
          href: "/result-lab",
          eyebrow: "Simulation",
        },
      ]}
    />
  );
}

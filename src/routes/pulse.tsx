import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { PublicOverview } from "@/components/PublicOverview";
import { useAllShows, useEditions } from "@/lib/data";
import { useContentEvents } from "@/lib/engagement-data";

export const Route = createFileRoute("/pulse")({
  component: PulseRoot,
});

function PulseRoot() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });
  const exactRoot = location.pathname === "/pulse" || location.pathname === "/pulse/";
  const view = (location.search as Record<string, unknown> | undefined)?.view;

  if (!exactRoot || view === "feed") return <Outlet />;
  return <PulseOverview />;
}

function PulseOverview() {
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: eventsData } = useContentEvents(20);

  const publicEditions = (editions ?? []).filter((edition) => edition.published);
  const publicShows = (shows ?? []).filter((show) => show.published);
  const latestEvents = eventsData?.events ?? [];

  return (
    <PublicOverview
      eyebrow="Pulse overview"
      title="Solaris Pulse"
      description="A calm front page for what is changing now. Open the feed when you want the stream itself, then use follows and preferences only when you want to tune it."
      highlights={[
        { label: "Recent updates", value: latestEvents.length },
        { label: "Public editions", value: publicEditions.length },
        { label: "Public shows", value: publicShows.length },
        { label: "Feed", value: "Live", hint: "Entries, national finals, results and records" },
      ]}
      discover={[
        {
          title: "Open the latest update feed",
          description: "See entry reveals, national-final activity, results, records and other recent public changes.",
          href: "/pulse?view=feed",
          eyebrow: "Latest updates",
        },
        {
          title: "Check Predictions",
          description: "See the current Prediction Arena and consensus movement when it is available.",
          href: "/predictions",
          eyebrow: "Predictions",
        },
        {
          title: "See current results",
          description: "Jump from a Pulse update into the newest published scoreboards and result views.",
          href: "/results",
          eyebrow: "Results",
        },
      ]}
      deepDive={[
        {
          title: "Manage follows and Pulse preferences",
          description: "Open the full Pulse workspace to tune follow levels, categories and your personal inbox.",
          href: "/pulse?view=feed",
          eyebrow: "Personal settings",
        },
        {
          title: "Open My Solaris",
          description: "See your country, participation, next actions and personal Solaris activity together.",
          href: "/my-solaris",
          eyebrow: "My Solaris",
        },
        {
          title: "Explore records",
          description: "Follow record threats and broken milestones back into the full archive.",
          href: "/records",
          eyebrow: "Record desk",
        },
      ]}
    />
  );
}

import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorldOfficeHistory } from "@/components/world/WorldOfficeHistory";

// The trailing underscore escapes a parent $slug route layout. This leaf is
// independent of the TG3 organization overview while preserving the URL.
export const Route = createFileRoute("/world/organizations/$slug/office-history")({
  head: ({ params }) => ({
    meta: [
      { title: "Institutional Leadership History — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Completed historical leadership terms from Terra Solaris public institutional records." },
    ],
    links: [{
      rel: "canonical",
      href: "https://studio.solaris-song-contest.workers.dev/world/organizations/"
        + encodeURIComponent(params.slug) + "/office-history",
    }],
  }),
  component: WorldOfficeHistoryRoute,
});

function WorldOfficeHistoryRoute() {
  const { slug } = Route.useParams();
  return (
    <AppShell>
      <WorldOfficeHistory key={slug} slug={slug} />
    </AppShell>
  );
}

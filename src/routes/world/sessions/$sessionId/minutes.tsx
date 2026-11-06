import { createFileRoute, notFound } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorldSessionMinutesWorkspace } from "@/components/world/WorldSessionMinutesWorkspace";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";

export const Route = createFileRoute("/world/sessions/$sessionId/minutes")({
  beforeLoad: () => {
    if (GLOBAL_MAINTENANCE_MODE) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Institutional Session Minutes — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "description", content: "Read officially published Terra Solaris session minutes or manage authorized institutional drafts." },
    ],
  }),
  component: MinutesRoute,
});

function MinutesRoute() {
  const { sessionId } = Route.useParams();
  return <AppShell>
    <WorldSessionMinutesWorkspace key={sessionId} sessionId={sessionId} />
  </AppShell>;
}

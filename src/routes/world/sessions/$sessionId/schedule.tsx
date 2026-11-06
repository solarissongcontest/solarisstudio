import { createFileRoute, notFound } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorldSessionScheduleEditor } from "@/components/world/WorldSessionScheduleEditor";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";

export const Route = createFileRoute("/world/sessions/$sessionId/schedule")({
  beforeLoad: () => {
    if (GLOBAL_MAINTENANCE_MODE) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Manage Session Schedule — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "description", content: "Authorized institutional time and venue editing for a scheduled Terra Solaris meeting." },
    ],
  }),
  component: ScheduleRoute,
});

function ScheduleRoute() {
  const { sessionId } = Route.useParams();
  return <AppShell>
    <WorldSessionScheduleEditor key={sessionId} sessionId={sessionId} />
  </AppShell>;
}

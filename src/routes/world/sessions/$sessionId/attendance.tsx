import { createFileRoute, notFound } from "@tanstack/react-router";

import { AppShell, PageHeader } from "@/components/AppShell";
import { WorldAttendanceEditor } from "@/components/world/WorldAttendanceEditor";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";

export const Route = createFileRoute("/world/sessions/$sessionId/attendance")({
  beforeLoad: () => {
    // Institutional attendance is not an emergency Confirmation exception.
    if (GLOBAL_MAINTENANCE_MODE) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Session attendance — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "description", content: "Governed institutional roll call and verified acting-proxy attendance." },
    ],
  }),
  component: AttendanceRoute,
});

function AttendanceRoute() {
  const { sessionId } = Route.useParams();
  return <AppShell>
    <PageHeader eyebrow="Terra Solaris · Institutional session"
      title="Attendance roll call"
      description="Record country attendance with current representation and approved proxy authority." />
    <WorldAttendanceEditor key={sessionId} sessionId={sessionId} />
  </AppShell>;
}

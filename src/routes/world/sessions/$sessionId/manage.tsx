import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldAgendaEditor } from "@/components/world/WorldAgendaEditor";

export const Route = createFileRoute("/world/sessions/$sessionId/manage")({
  head: () => ({
    meta: [
      { title: "Manage Institutional Agenda — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => {
    const { sessionId } = Route.useParams();
    return <AppShell><WorldAgendaEditor sessionId={sessionId} /></AppShell>;
  },
});

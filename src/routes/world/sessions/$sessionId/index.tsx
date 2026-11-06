import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldSessionDetail } from "@/components/world/WorldSessionDetail";

export const Route = createFileRoute("/world/sessions/$sessionId/")({
  component: () => {
    const { sessionId } = Route.useParams();
    return <AppShell><WorldSessionDetail key={sessionId} sessionId={sessionId} /></AppShell>;
  },
});

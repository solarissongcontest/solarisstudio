import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldMeasureDetailPage } from "@/components/world/WorldMeasuresWorkspace";

export const Route = createFileRoute("/world/measures/$measureId/")({
  head: () => ({
    meta: [{ title: "Official Measure — Terra Solaris" },
      { name: "description", content: "Published Terra Solaris institutional measure and version history." }],
  }),
  component: () => {
    const { measureId } = Route.useParams();
    return <WorldPublicGate verifyOnMount><AppShell>
      <WorldMeasureDetailPage measureId={measureId} />
    </AppShell></WorldPublicGate>;
  },
});

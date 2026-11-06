import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldMeasureManagement } from "@/components/world/WorldMeasureManagement";

export const Route = createFileRoute("/world/measures/$measureId/manage")({
  head: () => ({
    meta: [{ title: "Manage an Institutional Measure — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow" }],
  }),
  component: () => {
    const { measureId } = Route.useParams();
    return <WorldPublicGate verifyOnMount><AppShell>
      <WorldMeasureManagement measureId={measureId} />
    </AppShell></WorldPublicGate>;
  },
});

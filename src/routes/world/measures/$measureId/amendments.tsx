import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldMeasureAmendments } from "@/components/world/WorldMeasureAmendments";

export const Route = createFileRoute("/world/measures/$measureId/amendments")({
  head: () => ({
    meta: [
      { title: "Institutional Measure Amendments — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => {
    const {measureId} = Route.useParams();
    return <WorldPublicGate verifyOnMount>
      <AppShell><WorldMeasureAmendments measureId={measureId}/></AppShell>
    </WorldPublicGate>;
  },
});

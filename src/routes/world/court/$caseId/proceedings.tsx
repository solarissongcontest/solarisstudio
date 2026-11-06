import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldCourtProceedings } from "@/components/world/WorldCourtProceedings";

export const Route = createFileRoute("/world/court/$caseId/proceedings")({
  head: () => ({
    meta: [
      { title: "Court Hearings & Orders — Terra Solaris" },
      { name: "description", content: "Official Court orders and authorized hearing records." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CourtProceedingsPage,
});

function CourtProceedingsPage() {
  const { caseId } = Route.useParams();
  return (
    <WorldPublicGate verifyOnMount>
      <WorldCourtProceedings caseId={caseId} />
    </WorldPublicGate>
  );
}

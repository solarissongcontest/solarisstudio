import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldCourtJudgments } from "@/components/world/WorldCourtJudgments";

export const Route = createFileRoute("/world/court/$caseId/judgments")({
  head: () => ({
    meta: [
      { title: "Court Judgments & Reconsideration — Terra Solaris" },
      { name: "description", content: "Official Court judgments and authorized reconsideration." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CourtJudgmentPage,
});

function CourtJudgmentPage() {
  const { caseId } = Route.useParams();
  return (
    <WorldPublicGate verifyOnMount>
      <WorldCourtJudgments caseId={caseId} />
    </WorldPublicGate>
  );
}

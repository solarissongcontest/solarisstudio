import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldEthicsFindings } from "@/components/world/WorldEthicsFindings";

export const Route = createFileRoute("/world/ethics/$caseId/findings")({
  head: () => ({
    meta: [
      { title: "Private Ethics Findings — Terra Solaris" },
      { name: "description", content: "Authenticated institutional Ethics Committee case findings." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: EthicsFindingPage,
});

function EthicsFindingPage() {
  const { caseId } = Route.useParams();
  return (
    <WorldPublicGate verifyOnMount>
      <WorldEthicsFindings caseId={caseId} />
    </WorldPublicGate>
  );
}

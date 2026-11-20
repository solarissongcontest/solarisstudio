import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldUnionRecognitionWorkspace } from "@/components/world/WorldUnionRecognitionWorkspace";

export const Route = createFileRoute("/world/unions/")({
  head: () => ({
    meta: [
      { title: "Found New Unions — Terra Solaris" },
      { name: "description", content: "UNITY founding applications and real-country consent for new independent international unions." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: UnionRecognitionPage,
});

function UnionRecognitionPage() {
  return (
    <WorldPublicGate verifyOnMount>
      <WorldUnionRecognitionWorkspace />
    </WorldPublicGate>
  );
}

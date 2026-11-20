import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldEthicsWorkspace } from "@/components/world/WorldEthicsWorkspace";

export const Route = createFileRoute("/world/ethics/")({
  head: () => ({
    meta: [
      { title: "UNITY Ethics Committee — Terra Solaris" },
      { name: "description", content: "Private institutional ethics filing and explicitly authorized Ethics Committee review." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: EthicsPage,
});

function EthicsPage() {
  return (
    <WorldPublicGate verifyOnMount>
      <WorldEthicsWorkspace />
    </WorldPublicGate>
  );
}

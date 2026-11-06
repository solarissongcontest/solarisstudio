import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldMediationWorkspace } from "@/components/world/WorldMediationWorkspace";

export const Route = createFileRoute("/world/mediation/")({
  head: () => ({
    meta: [
      { title: "Institutional Mediation — Terra Solaris" },
      { name: "description", content: "Authenticated institutional mediation cases and official dispute resolution." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MediationPage,
});

function MediationPage() {
  return (
    <WorldPublicGate verifyOnMount>
      <WorldMediationWorkspace />
    </WorldPublicGate>
  );
}

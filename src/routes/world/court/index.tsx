import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldCourtWorkspace } from "@/components/world/WorldCourtWorkspace";

export const Route = createFileRoute("/world/court/")({
  head: () => ({
    meta: [
      { title: "International Terra Solaris Court — Solaris Studio" },
      { name: "description", content: "Official Court case filing, authorized responses and publication-safe docket." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CourtPage,
});

function CourtPage() {
  return (
    <WorldPublicGate verifyOnMount>
      <WorldCourtWorkspace />
    </WorldPublicGate>
  );
}

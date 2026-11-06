import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldExternalIntakeWorkspace } from "@/components/world/WorldExternalMeasureIntake";

export const Route = createFileRoute("/world/measures/external")({
  head: () => ({
    meta: [
      { title: "External Proposal Intake — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <WorldPublicGate verifyOnMount>
    <AppShell><WorldExternalIntakeWorkspace /></AppShell>
  </WorldPublicGate>,
});

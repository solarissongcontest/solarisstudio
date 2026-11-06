import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldMeasuresDirectory } from "@/components/world/WorldMeasuresWorkspace";

export const Route = createFileRoute("/world/measures/")({
  head: () => ({
    meta: [
      { title: "Institutional Proposals and Measures — Terra Solaris" },
      { name: "description", content: "Officially published Terra Solaris proposals, bills and institutional measures." },
    ],
  }),
  component: () => <WorldPublicGate verifyOnMount><AppShell><WorldMeasuresDirectory /></AppShell></WorldPublicGate>,
});

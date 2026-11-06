import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldMeasureSubmitPage } from "@/components/world/WorldMeasureSubmission";

export const Route = createFileRoute("/world/measures/new")({
  head: () => ({
    meta: [{ title: "Submit an Institutional Measure — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow" }],
  }),
  component: () => <WorldPublicGate verifyOnMount><AppShell><WorldMeasureSubmitPage /></AppShell></WorldPublicGate>,
});

import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldSessionEditor } from "@/components/world/WorldSessionEditor";

export const Route = createFileRoute("/world/sessions/new")({
  head: () => ({
    meta: [
      { title: "Schedule an Institutional Session — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <AppShell><WorldSessionEditor /></AppShell>,
});

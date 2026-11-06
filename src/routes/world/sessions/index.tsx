import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldSessionsDirectory } from "@/components/world/WorldSessionsDirectory";

export const Route = createFileRoute("/world/sessions/")({
  head: () => ({
    meta: [
      { title: "Institutional Sessions — Terra Solaris" },
      { name: "description", content: "Public institutional meetings and agendas across Terra Solaris." },
    ],
  }),
  component: () => <AppShell><WorldSessionsDirectory /></AppShell>,
});

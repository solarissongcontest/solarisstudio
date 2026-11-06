import { createFileRoute } from "@tanstack/react-router";
import { WorldWorkspacesDirectory } from "@/components/world/WorldPrivateWorkspace";

export const Route = createFileRoute("/world/workspaces/")({
  ssr: false,
  component: WorldWorkspacesDirectory,
  head: () => ({
    meta: [{ title: "My institutional workspaces — Terra Solaris" },
      { name: "robots", content: "noindex,nofollow,noarchive" }],
  }),
});

import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { MySolarisPersonalPage } from "@/components/mysolaris/MySolarisPersonalPage";

export const Route = createFileRoute("/_authenticated/my-solaris/saved")({
  head: () => ({
    meta: [
      { title: "MySolaris saved items — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SavedPage,
});

function SavedPage() {
  return (
    <AppShell>
      <MySolarisPersonalPage view="saved" />
    </AppShell>
  );
}

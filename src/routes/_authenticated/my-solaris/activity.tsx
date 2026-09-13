import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { MySolarisPersonalPage } from "@/components/mysolaris/MySolarisPersonalPage";

export const Route = createFileRoute("/_authenticated/my-solaris/activity")({
  head: () => ({
    meta: [
      { title: "MySolaris activity — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  return (
    <AppShell>
      <MySolarisPersonalPage view="activity" />
    </AppShell>
  );
}

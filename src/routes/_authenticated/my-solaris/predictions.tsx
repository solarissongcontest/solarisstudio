import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { MySolarisPersonalPage } from "@/components/mysolaris/MySolarisPersonalPage";

export const Route = createFileRoute("/_authenticated/my-solaris/predictions")({
  head: () => ({
    meta: [
      { title: "MySolaris predictions — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PredictionsPage,
});

function PredictionsPage() {
  return (
    <AppShell>
      <MySolarisPersonalPage view="predictions" />
    </AppShell>
  );
}

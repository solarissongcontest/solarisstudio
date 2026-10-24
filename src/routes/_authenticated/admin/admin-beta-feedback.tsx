import { createFileRoute } from "@tanstack/react-router";

import { AdminQaCoveragePage } from "@/components/admin/AdminQaCoveragePage";

export const Route = createFileRoute("/_authenticated/admin/admin-beta-feedback")({
  head: () => ({
    meta: [
      { title: "QA Coverage — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminQaCoveragePage,
});

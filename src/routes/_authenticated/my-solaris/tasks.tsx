import { createFileRoute } from "@tanstack/react-router";

import { MySolarisTasksPage } from "@/features/my-solaris/tasks/MySolarisTasksPage";

export const Route = createFileRoute("/_authenticated/my-solaris/tasks")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [{ title: "MySolaris tasks — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  component: MySolarisTasksPage,
});

import { createFileRoute } from "@tanstack/react-router";

import { HodWorkspacePage } from "@/routes/_authenticated/country-hub/hod";

export const Route = createFileRoute("/_authenticated/my-solaris/tasks")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [{ title: "MySolaris tasks — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  component: HodWorkspacePage,
});

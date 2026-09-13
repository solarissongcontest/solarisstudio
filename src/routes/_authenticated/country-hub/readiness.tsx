import { createFileRoute, redirect } from "@tanstack/react-router";

import { NAV_TARGETS } from "@/lib/navigation-targets";

export const Route = createFileRoute("/_authenticated/country-hub/readiness")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [{ title: "Entry Readiness — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: NAV_TARGETS.mySolarisEntry,
      search: { ...search, view: "readiness" },
      replace: true,
    });
  },
  component: () => null,
});

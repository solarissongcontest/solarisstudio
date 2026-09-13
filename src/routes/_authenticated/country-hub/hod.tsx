import { createFileRoute, redirect } from "@tanstack/react-router";

import { NAV_TARGETS } from "@/lib/navigation-targets";

export const Route = createFileRoute("/_authenticated/country-hub/hod")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Delegation workspace — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: NAV_TARGETS.mySolarisTasks, search, replace: true });
  },
  component: () => null,
});

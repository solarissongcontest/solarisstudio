import { createFileRoute, redirect } from "@tanstack/react-router";

import { NAV_TARGETS } from "@/lib/navigation-targets";

export const Route = createFileRoute("/_authenticated/country-hub/hod")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Delegation responsibilities — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: ({ search }) => {
    // Required HOD work belongs to Participate in V3. An explicit country
    // selector is an Organizer inspection context, so retain the proven legacy
    // task workspace for that cross-country case instead of impersonating it.
    if (search.country) {
      throw redirect({ to: NAV_TARGETS.mySolarisTasks, search, replace: true });
    }
    throw redirect({ to: NAV_TARGETS.participate, replace: true });
  },
  component: () => null,
});

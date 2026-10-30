import { createFileRoute, redirect } from "@tanstack/react-router";

import { NAV_TARGETS } from "@/lib/navigation-targets";

export const Route = createFileRoute("/_authenticated/country-hub/readiness")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entry Readiness — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: ({ search }) => {
    // Readiness is participant work and therefore belongs to Participate in V3.
    // An explicit country selector is Organizer inspection context, however, so
    // keep that on the proven read-only Entry/readiness surface instead of
    // impersonating the selected country as the signed-in participant.
    if (search.country) {
      throw redirect({
        to: NAV_TARGETS.mySolarisEntry,
        search: { ...search, view: "readiness" },
        replace: true,
      });
    }
    throw redirect({ to: NAV_TARGETS.participate, replace: true });
  },
});

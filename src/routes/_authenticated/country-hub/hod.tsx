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
    // The old HOD workspace owned delegation tasks, readiness, jury state and
    // required notices. Installed-app V3 owns those participant responsibilities
    // in Participate. Explicit Organizer country inspection stays on the proven
    // read-only MySolaris task surface so a country selector never impersonates
    // the signed-in participant.
    if (search.country) {
      throw redirect({ to: NAV_TARGETS.mySolarisTasks, search, replace: true });
    }
    throw redirect({ to: NAV_TARGETS.participate, replace: true });
  },
  component: () => null,
});

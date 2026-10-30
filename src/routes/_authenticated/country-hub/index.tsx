import { createFileRoute, redirect } from "@tanstack/react-router";

import { NAV_TARGETS } from "@/lib/navigation-targets";

export const Route = createFileRoute("/_authenticated/country-hub/")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  beforeLoad: ({ search }) => {
    // Country Hub is no longer a standalone V3 mental model. Normal HOD entry
    // lands in canonical Me; the explicit country selector remains a legacy
    // Organizer inspection context and must not be confused with caller state.
    if (search.country) {
      throw redirect({ to: NAV_TARGETS.mySolarisCountry, search, replace: true });
    }
    throw redirect({ to: NAV_TARGETS.mySolaris, replace: true });
  },
  head: () => ({ meta: [{ title: "Delegation — Solaris Studio" }] }),
});

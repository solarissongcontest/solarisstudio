import { createFileRoute, redirect } from "@tanstack/react-router";

import { NAV_TARGETS } from "@/lib/navigation-targets";

export const Route = createFileRoute("/_authenticated/country-hub/hod")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [
      { title: "HOD history — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: ({ search }) => {
    // HOD identity/history is a Me -> Delegation job in V3. The same legacy URL
    // remains valid for Organizer inspection: an explicit country override is
    // preserved and the target history route deliberately stays on its proven
    // legacy inspection surface instead of impersonating the signed-in viewer.
    throw redirect({
      to: NAV_TARGETS.mySolarisHistory,
      search: search.country ? search : undefined,
      replace: true,
    });
  },
  component: () => null,
});

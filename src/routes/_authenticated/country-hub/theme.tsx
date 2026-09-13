import { createFileRoute, redirect } from "@tanstack/react-router";

import { NAV_TARGETS } from "@/lib/navigation-targets";

export const Route = createFileRoute("/_authenticated/country-hub/theme")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: NAV_TARGETS.mySolarisTheme, search, replace: true });
  },
  head: () => ({ meta: [{ title: "Country appearance — Solaris Studio" }] }),
  component: () => null,
});

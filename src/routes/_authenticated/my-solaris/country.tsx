import { createFileRoute } from "@tanstack/react-router";

import { MySolarisCountryModule } from "@/components/mysolaris/modules/MySolarisCountryModule";

export const Route = createFileRoute("/_authenticated/my-solaris/country")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({ meta: [{ title: "My country — Solaris Studio" }] }),
  component: MySolarisCountryModule,
});

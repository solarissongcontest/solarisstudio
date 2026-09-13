import { createFileRoute } from "@tanstack/react-router";

import { CountryHubPage } from "@/features/my-solaris/country/MySolarisCountryPage";

export const Route = createFileRoute("/_authenticated/my-solaris/country")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({ meta: [{ title: "My country — Solaris Studio" }] }),
  component: CountryHubPage,
});

import { createFileRoute } from "@tanstack/react-router";

import { CountryPageBuilderRoute } from "@/features/my-solaris/page-builder/MySolarisPageBuilderPage";

export const Route = createFileRoute("/_authenticated/my-solaris/page-builder")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({ meta: [{ title: "Country page builder — Solaris Studio" }] }),
  component: CountryPageBuilderRoute,
});

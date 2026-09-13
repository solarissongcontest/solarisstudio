import { createFileRoute } from "@tanstack/react-router";

import { CountryThemeRoute } from "@/routes/_authenticated/country-hub/theme";

export const Route = createFileRoute("/_authenticated/my-solaris/theme")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({ meta: [{ title: "Country appearance — Solaris Studio" }] }),
  component: CountryThemeRoute,
});

import { createFileRoute } from "@tanstack/react-router";

import { MySolarisPageMediaModule } from "@/components/mysolaris/modules/MySolarisPageMediaModule";

export const Route = createFileRoute("/_authenticated/my-solaris/page-builder")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({ meta: [{ title: "Page & media — Solaris Studio" }] }),
  component: MySolarisPageMediaModule,
});

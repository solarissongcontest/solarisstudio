import { createFileRoute } from "@tanstack/react-router";

import { MySolarisEntryModule } from "@/components/mysolaris/modules/MySolarisEntryModule";

export const Route = createFileRoute("/_authenticated/my-solaris/entry")({
  validateSearch: (search: Record<string, unknown>): { country?: string; view?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
    view: typeof search.view === "string" ? search.view : undefined,
  }),
  head: () => ({
    meta: [
      { title: "MySolaris entry readiness — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MySolarisEntryModule,
});

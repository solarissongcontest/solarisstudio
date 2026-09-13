import { createFileRoute } from "@tanstack/react-router";

import { MySolarisCountryModule } from "@/components/mysolaris/modules/MySolarisCountryModule";

export const Route = createFileRoute("/_authenticated/my-solaris/history")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [{ title: "MySolaris history — Solaris Studio" }, { name: "robots", content: "noindex" }],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  return <MySolarisCountryModule section="history" />;
}

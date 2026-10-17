import { createFileRoute } from "@tanstack/react-router";

import { IntegrityCategoryStep } from "@/components/integrity/IntegrityReportV5";
import { V3IntegrityReportRouteShell } from "@/components/v3/V3IntegrityReportRouteShell";

export const Route = createFileRoute("/integrity/report/category")({
  validateSearch: (search: Record<string, unknown>) => ({
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Report a concern — Trust & Integrity" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useSearch();
  return (
    <V3IntegrityReportRouteShell>
      <IntegrityCategoryStep initialCategory={category} />
    </V3IntegrityReportRouteShell>
  );
}

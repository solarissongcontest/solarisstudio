import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { IntegrityCategoryStep } from "@/components/integrity/IntegrityReportV5";

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
    <AppShell>
      <IntegrityCategoryStep initialCategory={category} />
    </AppShell>
  );
}

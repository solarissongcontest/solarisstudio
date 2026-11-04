import { createFileRoute } from "@tanstack/react-router";
import { WorldLegalComparisonScreen } from "@/components/world/WorldLegalComparison";

function parseVersion(value: unknown): number | null {
  const number = typeof value === "string" && /^\d+$/.test(value)
    ? Number(value)
    : typeof value === "number" ? value : NaN;
  return Number.isSafeInteger(number) && number > 0 && number <= 100000 ? number : null;
}

export const Route = createFileRoute("/world/legal-compare/")({
  validateSearch: (search: Record<string, unknown>) => ({
    organization: typeof search.organization === "string" ? search.organization.trim() : "",
    document: typeof search.document === "string" ? search.document.trim() : "",
    from: parseVersion(search.from),
    to: parseVersion(search.to),
  }),
  head: () => ({
    meta: [
      { title: "Compare Published Institutional Document Versions — Terra Solaris" },
      {
        name: "description",
        content: "Compare public historical Terra Solaris institutional document versions, provision by provision.",
      },
    ],
  }),
  component: LegalComparisonRoute,
});

function LegalComparisonRoute() {
  return <WorldLegalComparisonScreen search={Route.useSearch()} />;
}

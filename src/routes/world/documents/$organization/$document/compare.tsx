import { createFileRoute } from "@tanstack/react-router";
import { WorldDocumentComparisonScreen } from "@/components/world/WorldDocumentComparisonScreen";

function safeVersion(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const candidate = typeof value === "string" && /^\d+$/.test(value)
    ? Number(value) : typeof value === "number" ? value : Number.NaN;
  // Explicitly invalid parameters remain invalid rather than silently
  // selecting a different official Version.
  return Number.isSafeInteger(candidate) && candidate >= 1 ? candidate : -1;
}

export const Route = createFileRoute("/world/documents/$organization/$document/compare")({
  validateSearch: (search: Record<string, unknown>) => ({
    from: safeVersion(search.from),
    to: safeVersion(search.to),
  }),
  head: () => ({
    meta: [
      { title: "Compare Published Legal Document Versions — Terra Solaris" },
      { name: "description", content: "Compare two published Terra Solaris institutional document Versions by durable provision identity." },
    ],
  }),
  component: CompareWorldDocumentPage,
});

function CompareWorldDocumentPage() {
  const { organization, document } = Route.useParams();
  const { from, to } = Route.useSearch();
  return <WorldDocumentComparisonScreen organization={organization} document={document}
    requestedFrom={from} requestedTo={to} />;
}

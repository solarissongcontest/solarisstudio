import { createFileRoute } from "@tanstack/react-router";
import { WorldDocumentPrintPage } from "@/components/world/WorldDocumentPrintPage";
import { WorldPublicGate } from "@/components/world/WorldPublic";

function versionOrInvalid(input: unknown): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  const number = typeof input === "string" && /^\d+$/.test(input)
    ? Number(input) : typeof input === "number" ? input : Number.NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : -1;
}

export const Route = createFileRoute("/world/documents/$organization/$document/print")({
  validateSearch: (search: Record<string, unknown>) => ({
    version: versionOrInvalid(search.version),
  }),
  head: () => ({
    meta: [
      { title: "Print Institutional Document — Terra Solaris" },
      { name: "description", content: "Print or save an authorized public Terra Solaris legal Version as PDF." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PrintWorldDocumentRoute,
});

function PrintWorldDocumentRoute() {
  const { organization, document } = Route.useParams();
  const { version } = Route.useSearch();
  return (
    <WorldPublicGate>
      <WorldDocumentPrintPage organization={organization} document={document} version={version} />
    </WorldPublicGate>
  );
}

import { createFileRoute } from "@tanstack/react-router";

import { WorldDocumentReaderScreen } from "@/components/v3/V3WorldDocumentLibrary";

function parseVersion(input: unknown): number | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  if (typeof input !== "number" && typeof input !== "string") return undefined;
  const number = Number(input);
  return Number.isSafeInteger(number) && number >= 1 ? number : undefined;
}

export const Route = createFileRoute("/world/documents/$organization/$document")({
  validateSearch: (search: Record<string, unknown>) => ({
    version: parseVersion(search.version),
  }),
  head: ({ params }) => ({
    meta: [
      { title: "Institutional Document · Terra Solaris" },
      { name: "description", content: "Read published Terra Solaris institutional documents and their historical revisions." },
    ],
    links: [{
      rel: "canonical",
      href: "https://studio.solaris-song-contest.workers.dev/world/documents/" +
        encodeURIComponent(params.organization) + "/" + encodeURIComponent(params.document),
    }],
  }),
  component: WorldDocumentPage,
});

function WorldDocumentPage() {
  const { organization, document } = Route.useParams();
  const { version } = Route.useSearch();
  return <WorldDocumentReaderScreen organization={organization} document={document} version={version} />;
}

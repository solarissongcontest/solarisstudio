import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { V3JuryShareComposer } from "@/components/v3/V3JuryShareComposer";

export const Route = createFileRoute("/results/jury-share")({
  validateSearch: (search: Record<string, unknown>) => ({
    showId: typeof search.showId === "string" ? search.showId : "",
    countryId: typeof search.countryId === "string" ? search.countryId : "",
  }),
  head: () => ({
    meta: [
      { title: "Jury share card — Solaris Studio" },
      {
        name: "description",
        content: "Create a shareable graphic from an officially published Solaris jury vote.",
      },
    ],
  }),
  component: JuryShareRoute,
});

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function JuryShareRoute() {
  const { showId, countryId } = Route.useSearch();
  const validIdentity = isUuid(showId) && isUuid(countryId);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Results"
        title="Jury share card"
        description="Turn an officially published country jury vote into a Solaris Story graphic."
        actions={
          <Link
            to="/results"
            className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold"
          >
            Back to Results
          </Link>
        }
      />

      {validIdentity ? (
        <V3JuryShareComposer showId={showId} countryId={countryId} />
      ) : (
        <Panel title="Choose a published jury vote">
          <p className="text-sm leading-6 text-muted-foreground">
            This Results tool needs an exact show and country identity from a published jury breakdown. Solaris does not infer those identities from names or labels.
          </p>
          <Link to="/results" className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary">
            Browse official Results →
          </Link>
        </Panel>
      )}
    </AppShell>
  );
}

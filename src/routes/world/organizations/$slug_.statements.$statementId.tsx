import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldOfficialStatementDetail } from "@/components/world/WorldOfficialStatements";

function validateVersion(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const normalized = String(raw);
  if (!/^[1-9][0-9]{0,5}$/.test(normalized)) return null;
  const result = Number(normalized);
  return Number.isSafeInteger(result) ? result : null;
}

// An independent statement leaf: TG3 organization overview owns no child Outlet.
export const Route = createFileRoute("/world/organizations/$slug/statements/$statementId")({
  validateSearch: (search: Record<string, unknown>): { version: number | null } => ({
    version: validateVersion(search.version),
  }),
  head: ({ params }) => ({
    meta: [
      { title: "Official Statement Record — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Published official statement, correction note and historical versions." },
    ],
    links: [{
      rel: "canonical",
      href: "https://studio.solaris-song-contest.workers.dev/world/organizations/"
        + encodeURIComponent(params.slug) + "/statements/"
        + encodeURIComponent(params.statementId),
    }],
  }),
  component: StatementDetailRoute,
});

function StatementDetailRoute() {
  const { slug, statementId } = Route.useParams();
  const { version } = Route.useSearch();
  return (
    <AppShell>
      <WorldOfficialStatementDetail slug={slug} statementId={statementId} version={version} />
    </AppShell>
  );
}

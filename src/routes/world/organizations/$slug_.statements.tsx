import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldOfficialStatementsDirectory } from "@/components/world/WorldOfficialStatements";

// Underscore escapes TG3's $slug leaf; no parent Outlet or shared route edits.
export const Route = createFileRoute("/world/organizations/$slug/statements")({
  head: ({ params }) => ({
    meta: [
      { title: "Official Statements — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Public institutional statements and immutable correction records." },
    ],
    links: [{
      rel: "canonical",
      href: "https://studio.solaris-song-contest.workers.dev/world/organizations/"
        + encodeURIComponent(params.slug) + "/statements",
    }],
  }),
  component: StatementDirectoryRoute,
});

function StatementDirectoryRoute() {
  const { slug } = Route.useParams();
  return (
    <AppShell>
      <WorldOfficialStatementsDirectory slug={slug} />
    </AppShell>
  );
}

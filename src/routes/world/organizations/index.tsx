import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldOrganizationsDirectory } from "@/components/world/WorldDirectory";

export const Route = createFileRoute("/world/organizations/")({
  head: () => ({
    meta: [
      { title: "International Organizations — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Search public international organizations, membership and institutional status in Terra Solaris." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/organizations" }],
  }),
  component: WorldOrganizationDirectoryRoute,
});

function WorldOrganizationDirectoryRoute() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl pb-10">
        <Link to={"/world" as never} className="inline-flex min-h-11 items-center text-sm font-semibold text-muted-foreground hover:text-primary">
          ← Terra Solaris
        </Link>
        <WorldOrganizationsDirectory />
      </main>
    </AppShell>
  );
}

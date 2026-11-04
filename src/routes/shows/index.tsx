import { createFileRoute } from "@tanstack/react-router";

import { AppShell, PageHeader } from "@/components/AppShell";
import { AppScreen } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3ShowsDiscoveryScreen } from "@/components/v3/V3ShowsDiscoveryScreen";

export const Route = createFileRoute("/shows/")({
  head: () => ({
    meta: [
      { title: "Shows — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Discover live, upcoming, recent and archived Solaris Song Contest shows from one broadcast-first surface.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://studio.solaris-song-contest.workers.dev/shows",
      },
    ],
  }),
  component: ShowsPage,
});

function ShowsPage() {
  const { isAppMode } = useSolarisApp();
  return isAppMode ? <AppShowsPage /> : <WebShowsPage />;
}

function AppShowsPage() {
  return (
    <AppShell>
      <AppScreen>
        <V3ShowsDiscoveryScreen />
      </AppScreen>
    </AppShell>
  );
}

function WebShowsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Show discovery"
        title="Shows"
        description="Live state comes first, upcoming and recent shows stay close at hand, and the full broadcast archive remains one filter away."
      />
      <div className="mx-auto w-full max-w-6xl pb-8">
        <V3ShowsDiscoveryScreen />
      </div>
    </AppShell>
  );
}

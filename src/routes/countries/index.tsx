import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader } from "@/components/AppShell";
import { AppScreen } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3CountriesDiscoveryScreen } from "@/components/v3/V3CountriesDiscoveryScreen";

export const Route = createFileRoute("/countries/")({
  head: () => ({
    meta: [
      { title: "Countries — Solaris Song Contest" },
      {
        name: "description",
        content:
          "Discover current Solaris delegations, movement between editions, regions and the complete country archive.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://studio.solaris-song-contest.workers.dev/countries",
      },
    ],
  }),
  component: CountriesPage,
});

function CountriesPage() {
  const { isAppMode } = useSolarisApp();
  return isAppMode ? <AppCountriesPage /> : <WebCountriesPage />;
}

function AppCountriesPage() {
  return (
    <AppShell>
      <AppScreen>
        <V3CountriesDiscoveryScreen />
      </AppScreen>
    </AppShell>
  );
}

function WebCountriesPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Country discovery"
        title="Countries"
        description="Start with the current contest and movement across Terra Solaris, then browse the complete country archive when you need it."
        className="directory-page-hero countries-library-hero"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/compare"
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
            >
              Compare countries
            </Link>
            <Link
              to="/records"
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
            >
              Country records
            </Link>
          </div>
        }
      />
      <div className="mx-auto w-full max-w-6xl pb-8">
        <V3CountriesDiscoveryScreen />
      </div>
    </AppShell>
  );
}

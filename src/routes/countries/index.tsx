import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader } from "@/components/AppShell";
import { AppScreen } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { useCountryDirectoryPresentation } from "@/lib/use-country-directory-presentation";
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
  const { platformResolved } = useSolarisApp();
  const presentation = useCountryDirectoryPresentation();

  // Avoid flashing website navigation before installed-app identity resolves.
  if (!platformResolved) {
    return (
      <div data-country-directory-boot="" className="min-h-20 w-full" role="status" aria-label="Opening countries" />
    );
  }
  return presentation === "installed-app"
    ? <AppCountriesPage />
    : <WebCountriesPage presentation={presentation} />;
}

function AppCountriesPage() {
  return (
    <AppShell>
      <AppScreen>
        <V3CountriesDiscoveryScreen presentation="installed-app" />
      </AppScreen>
    </AppShell>
  );
}

function WebCountriesPage({ presentation }: { presentation: "mobile-web" | "desktop-web" }) {
  const mobileWeb = presentation === "mobile-web";
  return (
    <AppShell>
      {mobileWeb ? (
        <header className="country-directory-mobile-masthead" data-country-directory-web-header="">
          <Link to="/explore" className="country-directory-mobile-back">Explore / Countries</Link>
          <h1>Countries</h1>
          <p>Discover every country of Terra Solaris, explore its history and open its profile.</p>
        </header>
      ) : (
      <PageHeader
        eyebrow="Delegation directory"
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
              Most successful delegations
            </Link>
          </div>
        }
      />
      )}
      <div className={mobileWeb ? "mx-auto w-full max-w-2xl pb-8" : "mx-auto w-full max-w-6xl pb-8"}>
        <V3CountriesDiscoveryScreen presentation={presentation} />
      </div>
    </AppShell>
  );
}

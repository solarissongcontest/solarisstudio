import { createFileRoute, Link } from "@tanstack/react-router";

import { AppShell, PageHeader } from "@/components/AppShell";
import { AppScreen } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3ShowsDiscoveryScreen } from "@/components/v3/V3ShowsDiscoveryScreen";
import { useV3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import "@/styles/v3-directory-family.css";

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
  const { platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();

  if (!platformResolved) {
    return <div data-directory-boot="" className="min-h-20" role="status" aria-label="Opening shows" />;
  }

  if (presentation === "installed-app") {
    return (
      <AppShell>
        <div className="v3-directory-family" data-directory-experience={presentation}>
          <AppScreen>
            <header className="v3-directory-app-heading">
              <p className="v3-directory-eyebrow">BROADCAST DISCOVERY</p>
              <h1>Shows</h1>
              <p>On air, coming up and published show history.</p>
            </header>
            <V3ShowsDiscoveryScreen presentation={presentation} />
          </AppScreen>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="v3-directory-family" data-directory-experience={presentation}>
        {presentation === "mobile-web" ? (
          <header className="v3-directory-mobile-header" data-directory-mobile-header="">
            <Link to="/explore" className="v3-directory-back">Explore / Shows</Link>
            <p className="v3-directory-eyebrow">BROADCAST ARCHIVE</p>
            <h1>Shows</h1>
            <p>Find what is live, next, recently completed or archived.</p>
          </header>
        ) : (
          <PageHeader
            eyebrow="Show discovery"
            title="Shows"
            description="Live state comes first, upcoming and recent shows stay close at hand, and the full broadcast archive remains one filter away."
          />
        )}
        <div className={presentation === "mobile-web" ? "mx-auto w-full max-w-2xl pb-8" : "mx-auto w-full max-w-6xl pb-8"}>
          <V3ShowsDiscoveryScreen presentation={presentation} />
        </div>
      </div>
    </AppShell>
  );
}

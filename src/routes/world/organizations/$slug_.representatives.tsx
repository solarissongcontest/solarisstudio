import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { AppScreen } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { WorldRepresentativeRoster } from "@/components/world/WorldRepresentativeRoster";

// The trailing underscore in the filename escapes the parent $slug route.
// This remains an independent leaf; it does not require #1934's Outlet.
export const Route = createFileRoute("/world/organizations/$slug/representatives")({
  head: ({ params }) => ({
    meta: [
      { title: "Institutional Representatives — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Browse the officially recorded current and former country representatives of a public Terra Solaris institution." },
    ],
    links: [{
      rel: "canonical",
      href: "https://studio.solaris-song-contest.workers.dev/world/organizations/"
        + encodeURIComponent(params.slug) + "/representatives",
    }],
  }),
  component: WorldRepresentativeRoute,
});

function WorldRepresentativeRoute() {
  const { slug } = Route.useParams();
  const { isAppMode } = useSolarisApp();
  return <AppShell>
    {isAppMode ? <AppScreen><WorldRepresentativeRoster slug={slug} /></AppScreen> :
      <div className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6">
        <WorldRepresentativeRoster slug={slug} />
      </div>}
  </AppShell>;
}

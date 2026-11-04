import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AppScreen } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3WorldOrganizationDetail } from "@/components/v3/V3WorldOrganizationsScreen";

export const Route = createFileRoute("/world/organizations/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: "Terra Solaris Institution — Solaris Studio" },
      { name: "description", content: "Public Terra Solaris institutional identity, leadership and confirmed membership." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/organizations/" + encodeURIComponent(params.slug) }],
  }),
  component: WorldOrganizationPage,
});

function WorldOrganizationPage() {
  const { slug } = Route.useParams();
  const { isAppMode } = useSolarisApp();
  return <AppShell>{isAppMode
    ? <AppScreen><V3WorldOrganizationDetail slug={slug} /></AppScreen>
    : <div className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6"><V3WorldOrganizationDetail slug={slug} /></div>}
  </AppShell>;
}

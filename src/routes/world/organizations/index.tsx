import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AppScreen } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3WorldOrganizationsDirectory } from "@/components/v3/V3WorldOrganizationsScreen";

export const Route = createFileRoute("/world/organizations/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris Organizations — Solaris Studio" },
      { name: "description", content: "Discover public Terra Solaris institutions, leadership and confirmed membership." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/organizations" }],
  }),
  component: WorldOrganizationsPage,
});

function WorldOrganizationsPage() {
  const { isAppMode } = useSolarisApp();
  return <AppShell>{isAppMode
    ? <AppScreen><V3WorldOrganizationsDirectory /></AppScreen>
    : <div className="mx-auto w-full max-w-5xl px-4 pb-12 sm:px-6"><V3WorldOrganizationsDirectory /></div>}
  </AppShell>;
}

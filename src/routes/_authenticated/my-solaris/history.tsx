import { createFileRoute } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisProvider } from "@/components/mysolaris/MySolarisContext";
import { MySolarisCountryModule } from "@/components/mysolaris/modules/MySolarisCountryModule";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3DelegationHistoryScreen } from "@/components/v3/V3DelegationHistoryScreen";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/my-solaris/history")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Delegation history — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { country } = Route.useSearch();
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode && !country);

  if (!platformResolved || (isAppMode && !country && rollout.isLoading)) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
        Opening delegation history…
      </p>
    );
  }

  if (
    !country &&
    isAppMode &&
    !rollout.isError &&
    rollout.data?.enabled === true &&
    rollout.data.meEnabled === true &&
    rollout.data.userId
  ) {
    return (
      <MySolarisProvider editionId={rollout.data.editionId}>
        <V3AppShell editionLabel="Solaris Studio" phaseLabel="History" activeArea="me">
          <V3DelegationHistoryScreen viewerId={rollout.data.userId} />
        </V3AppShell>
      </MySolarisProvider>
    );
  }

  // Compatibility path only. Public-web / rollback keeps the proven country
  // editor, and an explicit Organizer country override must never be mistaken
  // for the signed-in viewer's private V3 history.
  return <MySolarisCountryModule section="history" />;
}

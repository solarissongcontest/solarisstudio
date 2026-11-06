import { createFileRoute } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisCountryModule } from "@/components/mysolaris/modules/MySolarisCountryModule";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3PersonalHistoryScreen } from "@/components/v3/V3PersonalHistoryScreen";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/my-solaris/history")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Participation history — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
        Opening your history…
      </p>
    );
  }

  if (
    isAppMode &&
    !rollout.isError &&
    rollout.data?.enabled === true &&
    rollout.data.meEnabled === true
  ) {
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="History" activeArea="me">
        <V3PersonalHistoryScreen />
      </V3AppShell>
    );
  }

  // Compatibility fallback only. The optional country selector belongs to the
  // legacy country-history editor and is not used by the V3 caller-scoped read.
  return <MySolarisCountryModule section="history" />;
}

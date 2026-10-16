import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisPersonalPage } from "@/components/mysolaris/MySolarisPersonalPage";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3ParticipantActivityScreen } from "@/components/v3/V3ParticipantActivityScreen";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/my-solaris/activity")({
  head: () => ({
    meta: [
      { title: "MySolaris activity — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
        Opening your activity…
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
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Activity" activeArea="me">
        <V3ParticipantActivityScreen />
      </V3AppShell>
    );
  }

  return (
    <AppShell>
      <MySolarisPersonalPage view="activity" />
    </AppShell>
  );
}

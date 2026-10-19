import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { ProfileActivityPanel } from "@/components/country/ProfileActivityPanel";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3FanIdentityScreen } from "@/components/v3/V3FanIdentityScreen";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/my-solaris/profile")({
  head: () => ({
    meta: [
      { title: "Public fan identity — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: FanIdentityPage,
});

function FanIdentityPage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
        Opening fan identity…
      </p>
    );
  }

  if (
    isAppMode &&
    !rollout.isError &&
    rollout.data?.enabled === true &&
    rollout.data.meEnabled === true &&
    rollout.data.userId
  ) {
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Fan identity" activeArea="me">
        <V3FanIdentityScreen />
      </V3AppShell>
    );
  }

  return (
    <AppShell>
      <ProfileActivityPanel />
    </AppShell>
  );
}

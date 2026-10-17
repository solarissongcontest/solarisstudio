import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisPersonalPage } from "@/components/mysolaris/MySolarisPersonalPage";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3FollowingSavedScreen } from "@/components/v3/V3FollowingSavedScreen";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/my-solaris/saved")({
  head: () => ({
    meta: [
      { title: "Following & Saved — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SavedPage,
});

function SavedPage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
        Opening Following & Saved…
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
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Following & Saved" activeArea="me">
        <V3FollowingSavedScreen viewerId={rollout.data.userId} />
      </V3AppShell>
    );
  }

  return (
    <AppShell>
      <MySolarisPersonalPage view="saved" />
    </AppShell>
  );
}

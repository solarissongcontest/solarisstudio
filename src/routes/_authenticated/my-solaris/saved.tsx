import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisPersonalPage } from "@/components/mysolaris/MySolarisPersonalPage";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3SavedScreen } from "@/components/v3/V3SavedScreen";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { useV3SavedProjection } from "@/lib/v3-saved-runtime";

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
  const shouldLoad =
    platformResolved &&
    isAppMode &&
    !rollout.isError &&
    rollout.data?.enabled === true &&
    rollout.data?.meEnabled === true &&
    Boolean(rollout.data?.userId);
  const saved = useV3SavedProjection(shouldLoad, rollout.data?.userId);

  if (!isAppMode) return <LegacySaved />;
  if (!platformResolved || rollout.isLoading || (shouldLoad && saved.isLoading)) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10" data-v3-saved-boot="">
        <h1 className="text-2xl font-bold">Following & Saved</h1>
        <p className="mt-2 text-sm text-muted-foreground" role="status" aria-live="polite">
          Opening your saved Solaris items…
        </p>
      </main>
    );
  }
  if (
    rollout.isError ||
    rollout.data?.enabled !== true ||
    rollout.data?.meEnabled !== true ||
    !rollout.data.userId ||
    saved.isError ||
    !saved.data ||
    saved.data.viewerId !== rollout.data.userId
  ) {
    return <LegacySaved />;
  }

  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel="Following & Saved" activeArea="me">
      <V3SavedScreen viewerId={rollout.data.userId} projection={saved.data} />
    </V3AppShell>
  );
}

function LegacySaved() {
  return (
    <AppShell>
      <MySolarisPersonalPage view="saved" />
    </AppShell>
  );
}

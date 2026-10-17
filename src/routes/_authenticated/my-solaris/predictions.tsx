import { createFileRoute, Navigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisPersonalPage } from "@/components/mysolaris/MySolarisPersonalPage";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/my-solaris/predictions")({
  head: () => ({
    meta: [
      { title: "MySolaris predictions — Solaris Studio" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PredictionsPage,
});

function PredictionsPage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (isAppMode && (!platformResolved || rollout.isLoading)) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
        Opening Predictions…
      </p>
    );
  }

  if (isAppMode && !rollout.isError && rollout.data?.enabled === true) {
    return <Navigate to="/predictions" replace />;
  }

  return (
    <AppShell>
      <MySolarisPersonalPage view="predictions" />
    </AppShell>
  );
}

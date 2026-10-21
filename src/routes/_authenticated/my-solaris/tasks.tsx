import { createFileRoute, Navigate } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { MySolarisTasksModule } from "@/components/mysolaris/modules/MySolarisTasksModule";
import { NAV_TARGETS } from "@/lib/navigation-targets";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/_authenticated/my-solaris/tasks")({
  validateSearch: (search: Record<string, unknown>): { country?: string } => ({
    country: typeof search.country === "string" ? search.country : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Participant tasks — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ParticipantTasksCompatibilityRoute,
});

function ParticipantTasksCompatibilityRoute() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <p className="px-4 py-10 text-sm text-muted-foreground" role="status" aria-live="polite">
        Opening Participate…
      </p>
    );
  }

  if (isAppMode && !rollout.isError && rollout.data?.enabled === true) {
    return <Navigate to={NAV_TARGETS.participate} replace />;
  }

  return <MySolarisTasksModule />;
}

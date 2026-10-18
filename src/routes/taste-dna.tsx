import { createFileRoute, Outlet } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3TasteDnaScreen } from "@/components/v3/V3TasteDnaScreen";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/taste-dna")({
  component: TasteDnaRoute,
});

function TasteDnaRoute() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold">Taste DNA</h1>
        <p role="status" className="mt-3">Opening Taste DNA…</p>
      </main>
    );
  }

  const v3Enabled =
    isAppMode &&
    !rollout.isError &&
    rollout.data?.enabled === true;

  if (!v3Enabled) {
    return <Outlet />;
  }

  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel="Taste DNA">
      <V3TasteDnaScreen />
    </V3AppShell>
  );
}

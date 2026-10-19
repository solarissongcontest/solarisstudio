import { createFileRoute, Outlet } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3ScreenHeader, V3Surface } from "@/components/v3/V3Foundation";
import { V3TasteDnaScreen } from "@/components/v3/V3TasteDnaScreen";
import { useFanSession } from "@/lib/prediction-data";
import { useTasteBallots } from "@/lib/taste-data";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";

export const Route = createFileRoute("/taste-dna")({
  component: TasteDnaRoute,
});

function TasteDnaRoute() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const session = useFanSession();
  const privateHistory = useTasteBallots(session.data?.id);

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

  const privateHistoryLoading =
    session.isLoading || Boolean(session.data?.id && privateHistory.isLoading);
  const privateHistoryFailed =
    session.isError || Boolean(session.data?.id && privateHistory.isError);

  if (privateHistoryLoading || privateHistoryFailed) {
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Taste DNA">
        <V3Screen className="pb-8">
          <V3ScreenHeader
            kicker="Personal analytics"
            title="Taste DNA"
            description="Rank a published field and compare your preferences with published jury, televote and overall results."
          />
          <V3Surface>
            {privateHistoryFailed ? (
              <div data-v3-taste-dna-private-history="error">
                <p className="text-sm font-semibold" role="alert">
                  Your private Taste DNA history could not be verified.
                </p>
                <p className="mt-1 text-xs leading-5 text-[var(--v3-text-secondary)]">
                  Editing stays unavailable so Solaris cannot overwrite a saved ranking that was not loaded.
                </p>
              </div>
            ) : (
              <p
                data-v3-taste-dna-private-history="loading"
                role="status"
                aria-live="polite"
                className="text-sm text-[var(--v3-text-secondary)]"
              >
                Loading your private Taste DNA history…
              </p>
            )}
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel="Taste DNA">
      <V3TasteDnaScreen />
    </V3AppShell>
  );
}

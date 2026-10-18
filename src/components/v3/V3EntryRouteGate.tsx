import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { resolveV3FocusedTaskChrome } from "@/lib/v3-focused-task-chrome";
import { useV3EntryBundle } from "@/lib/v3-entry-runtime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3EntryLifecyclePanel } from "./V3EntryLifecyclePanel";
import { V3EntryResubmissionPanel } from "./V3EntryResubmissionPanel";
import { V3EntryScreen } from "./V3EntryScreen";
import { V3FocusedTaskShell } from "./V3FocusedTaskShell";

const ENTRY_FOCUSED_CHROME = resolveV3FocusedTaskChrome("/my-solaris/entry");

function ResolvingEntrySurface() {
  return (
    <div
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-entry-boot=""
      data-v3-critical-task-content=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Participate · Entry
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          Your entry
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Checking your current delegation, readiness and immutable review evidence.
        </p>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        Opening your Entry workspace.
      </p>
    </div>
  );
}

/**
 * Installed-app participant Entry cutover. Organizer country inspection and
 * every disabled/error state preserve the canonical legacy module. The V3
 * private bundle is not requested until the server has authorized the slice and
 * identified an authenticated viewer. Once authorized, Entry reuses the shared
 * focused critical-task shell rather than carrying global app navigation into
 * a submission workflow. The resolving surface already opts into focused
 * presentation so legacy app chrome cannot flash while authorization/bundle
 * state is settling.
 */
export function V3EntryRouteGate({
  legacy,
  organizerInspection,
  focusReadiness,
}: {
  legacy: ReactNode;
  organizerInspection: boolean;
  focusReadiness: boolean;
}) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(
    platformResolved && isAppMode && !organizerInspection,
  );
  const shouldLoadBundle =
    platformResolved &&
    isAppMode &&
    !organizerInspection &&
    rollout.data?.enabled === true &&
    rollout.data?.entryEnabled === true &&
    Boolean(rollout.data?.userId);
  const bundle = useV3EntryBundle(shouldLoadBundle, rollout.data?.userId);

  if (organizerInspection || !isAppMode) return <>{legacy}</>;
  if (!platformResolved || rollout.isLoading) return <ResolvingEntrySurface />;
  if (
    rollout.isError ||
    rollout.data?.enabled !== true ||
    rollout.data?.entryEnabled !== true ||
    !rollout.data.userId
  ) {
    return <>{legacy}</>;
  }
  if (bundle.isLoading) return <ResolvingEntrySurface />;
  if (bundle.isError || !bundle.data) return <>{legacy}</>;

  return (
    <V3FocusedTaskShell
      chrome={ENTRY_FOCUSED_CHROME}
      editionLabel={bundle.data.shell.editionLabel}
      statusLabel={bundle.data.shell.phaseLabel}
    >
      <V3EntryLifecyclePanel projection={bundle.data.projection} />
      <V3EntryResubmissionPanel projection={bundle.data.projection} />
      <V3EntryScreen
        projection={bundle.data.projection}
        focusReadiness={focusReadiness}
      />
    </V3FocusedTaskShell>
  );
}

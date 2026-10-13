import { NextInLineCompetition } from "@/components/NextInLineCompetition";
import { ParticipationRouteChromeOwner } from "@/components/ParticipationServiceShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { resolveV3FocusedTaskChrome } from "@/lib/v3-focused-task-chrome";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3FocusedTaskShell } from "./V3FocusedTaskShell";

function ResolvingNextInLineSurface() {
  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-primary-boot=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Participate
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          Opening Next in Line
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Checking the current installed-app task experience.
        </p>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        Checking the current Next in Line experience.
      </p>
    </main>
  );
}

/**
 * Reversible installed-app cutover for Next in Line only. The canonical task
 * component continues to own every read, validation and submission. Public web
 * and any disabled/error rollout decision keep the proven legacy task chrome.
 */
export function V3NextInLineRouteGate() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved) return <ResolvingNextInLineSurface />;
  if (!isAppMode) return <NextInLineCompetition />;
  if (rollout.isLoading) return <ResolvingNextInLineSurface />;
  if (
    rollout.isError ||
    rollout.data?.enabled !== true ||
    rollout.data?.nextInLineEnabled !== true
  ) {
    return <NextInLineCompetition />;
  }

  let chrome;
  try {
    chrome = resolveV3FocusedTaskChrome("/next-in-line");
  } catch {
    return <NextInLineCompetition />;
  }

  return (
    <V3FocusedTaskShell chrome={chrome}>
      <ParticipationRouteChromeOwner>
        <NextInLineCompetition />
      </ParticipationRouteChromeOwner>
    </V3FocusedTaskShell>
  );
}

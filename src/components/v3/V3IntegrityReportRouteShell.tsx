import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { resolveV3FocusedTaskChrome } from "@/lib/v3-focused-task-chrome";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3FocusedTaskShell } from "./V3FocusedTaskShell";

function ResolvingIntegrityReportSurface() {
  return (
    <div
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-integrity-report-boot=""
      data-v3-critical-task-content=""
      aria-busy="true"
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">
          Trust & Integrity
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          Report a concern
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Preparing the protected reporting workspace.
        </p>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        Opening the reporting workspace.
      </p>
    </div>
  );
}

/**
 * Shell-only V3 cutover for the Integrity Report flow.
 *
 * The existing report steps retain all draft, privacy, validation, submission,
 * receipt and safety-shield behavior. This gate only decides whether the route
 * is presented inside the canonical critical-task shell. The report's own
 * header already owns Exit, Help/Exit quickly, progress and the document H1, so
 * its canonical screen contract intentionally uses the hidden shell toolbar.
 */
export function V3IntegrityReportRouteShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!isAppMode) return <AppShell>{children}</AppShell>;
  if (!platformResolved || rollout.isLoading) return <ResolvingIntegrityReportSurface />;
  if (rollout.isError || rollout.data?.enabled !== true) {
    return <AppShell>{children}</AppShell>;
  }

  const chrome = resolveV3FocusedTaskChrome(pathname);

  return (
    <V3FocusedTaskShell chrome={chrome} contentWidth="wide">
      {children}
    </V3FocusedTaskShell>
  );
}

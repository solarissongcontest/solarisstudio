import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  ParticipationRouteChrome,
  ParticipationServiceShell,
} from "@/components/ParticipationServiceShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { resolveV3FocusedTaskChrome } from "@/lib/v3-focused-task-chrome";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3ConfirmationPresentation } from "./V3ConfirmationPresentation";
import { V3FocusedTaskShell } from "./V3FocusedTaskShell";
import { V3Screen, V3ScreenHeader } from "./V3Foundation";

type ConfirmationRouteAction = {
  to: string;
  label: string;
};

type V3ConfirmationRouteShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ConfirmationRouteAction[];
  maxWidth?: string;
  editionLabel?: string | null;
  phaseLabel?: string | null;
};

const CONFIRMATION_FOCUSED_CHROME = resolveV3FocusedTaskChrome("/confirmations");

function ResolvingConfirmationRoute({
  title,
  description,
}: Pick<V3ConfirmationRouteShellProps, "title" | "description">) {
  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-confirmation-route-boot=""
      data-v3-critical-task-content=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Participate · Confirmation
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        Checking the current Confirmation experience.
      </p>
    </main>
  );
}

/**
 * Reversible route-level cutover for the complete Confirmation workflow.
 *
 * Public web and a disabled/unavailable Confirmation rollout keep the proven
 * participation shell. Installed-app users only receive the V3 focused critical
 * task chrome when both the global V3 flag and the independent Confirmation
 * slice flag have been evaluated server-side as enabled. The Confirmation
 * feature still owns draft state, submission authority and reconciliation.
 */
export function V3ConfirmationRouteShell({
  title,
  description,
  children,
  actions = [],
  maxWidth = "max-w-6xl",
  editionLabel,
  phaseLabel = "Confirmation",
}: V3ConfirmationRouteShellProps) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return <ResolvingConfirmationRoute title={title} description={description} />;
  }

  if (!isAppMode || rollout.isError || rollout.data?.confirmationEnabled !== true) {
    return (
      <ParticipationRouteChrome>
        <ParticipationServiceShell
          service="confirmations"
          title={title}
          description={description}
          actions={actions}
          maxWidth={maxWidth}
        >
          {children}
        </ParticipationServiceShell>
      </ParticipationRouteChrome>
    );
  }

  const visibleActions = actions.filter(
    (action) =>
      action.to !== "/confirmations/next-in-line" &&
      action.to !== "/next-in-line" &&
      action.to !== "/participate",
  );

  return (
    <V3FocusedTaskShell
      chrome={CONFIRMATION_FOCUSED_CHROME}
      editionLabel={editionLabel?.trim() || "Solaris Song Contest"}
      statusLabel={phaseLabel}
    >
      <V3Screen className="v3-confirmation-route-screen">
        <div data-v3-confirmation-route="">
          <V3ScreenHeader
            kicker="Participate · Confirmation"
            title={title}
            description={description ?? ""}
          />

          {visibleActions.length ? (
            <nav
              className="mb-5 flex flex-wrap gap-2"
              aria-label="Confirmation options"
            >
              {visibleActions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to as any}
                  className="inline-flex min-h-10 items-center justify-center rounded-xl border border-[var(--v3-border-subtle)] bg-white/[0.025] px-3 text-xs font-semibold text-[var(--v3-text-secondary)] transition hover:border-[var(--v3-border)] hover:bg-white/[0.045] hover:text-[var(--v3-text-primary)]"
                >
                  {action.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div data-v3-confirmation-route-content="">
            <V3ConfirmationPresentation>{children}</V3ConfirmationPresentation>
          </div>
        </div>
      </V3Screen>
    </V3FocusedTaskShell>
  );
}

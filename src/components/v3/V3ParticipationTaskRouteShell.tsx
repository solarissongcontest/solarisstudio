import type { ReactNode } from "react";

import {
  ParticipationRouteChrome,
  ParticipationServiceShell,
} from "@/components/ParticipationServiceShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { resolveV3FocusedTaskChrome } from "@/lib/v3-focused-task-chrome";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3FocusedTaskShell } from "./V3FocusedTaskShell";
import { V3Screen, V3ScreenHeader } from "./V3Foundation";

type ParticipationService = "jury" | "televoting" | "next-in-line";

type ParticipationRouteAction = {
  to: string;
  label: string;
};

type V3ParticipationTaskRouteShellProps = {
  service: ParticipationService;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ParticipationRouteAction[];
  maxWidth?: string;
  editionLabel?: string | null;
  statusLabel?: string | null;
};

const SERVICE_ROUTE: Record<ParticipationService, string> = {
  jury: "/jury-voting",
  televoting: "/televoting",
  "next-in-line": "/next-in-line",
};

const SERVICE_KICKER: Record<ParticipationService, string> = {
  jury: "Participate · Jury",
  televoting: "Participate · Televoting",
  "next-in-line": "Participate · Next in Line",
};

const SERVICE_CHROME = {
  jury: resolveV3FocusedTaskChrome("/jury-voting"),
  televoting: resolveV3FocusedTaskChrome("/televoting"),
  "next-in-line": resolveV3FocusedTaskChrome("/next-in-line"),
} as const;

/**
 * Shared route-level cutover for the remaining critical participation flows.
 *
 * Browser mode and a disabled/unavailable V3 rollout keep the proven legacy
 * participation shell. Installed-app V3 uses the canonical focused task shell,
 * which removes global navigation, owns update blocking and keeps Back/Help
 * visible while leaving every workflow's data, draft and mutation authority in
 * the feature that already owns it.
 */
export function V3ParticipationTaskRouteShell({
  service,
  title,
  description,
  children,
  actions = [],
  maxWidth = "max-w-6xl",
  editionLabel,
  statusLabel,
}: V3ParticipationTaskRouteShellProps) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const featureEnabled =
    rollout.data?.enabled === true &&
    (service !== "jury" || rollout.data.juryEnabled === true);

  if (!platformResolved || (isAppMode && rollout.isLoading)) {
    return (
      <div
        className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
        data-v3-focused-task-boot={SERVICE_ROUTE[service]}
        data-v3-critical-task-content=""
      >
        <header className="border-b border-border/70 pb-5">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
            {SERVICE_KICKER[service]}
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
          Opening {title}.
        </p>
      </div>
    );
  }

  if (!isAppMode || rollout.isError || !featureEnabled) {
    return (
      <ParticipationRouteChrome>
        <ParticipationServiceShell
          service={service}
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

  return (
    <V3FocusedTaskShell
      chrome={SERVICE_CHROME[service]}
      editionLabel={editionLabel}
      statusLabel={statusLabel}
    >
      <V3Screen className="v3-participation-task-route-screen">
        <V3ScreenHeader
          kicker={SERVICE_KICKER[service]}
          title={title}
          description={description}
        />
        <ParticipationServiceShell
          service={service}
          title={title}
          description={description}
          actions={actions}
          maxWidth={maxWidth}
        >
          {children}
        </ParticipationServiceShell>
      </V3Screen>
    </V3FocusedTaskShell>
  );
}

import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { V3AppShell } from "./V3AppShell";

function ResolvingRulesSurface({ title }: { title: string }) {
  return (
    <main
      className="relative z-10 mx-auto w-full max-w-3xl px-4 py-10 sm:py-14"
      data-v3-primary-boot=""
    >
      <header className="border-b border-border/70 pb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">
          Rules & guidance
        </p>
        <h1 className="mt-2 font-display text-3xl font-black tracking-[-0.04em] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Checking the current installed-app Rules experience.
        </p>
      </header>
      <p className="sr-only" role="status" aria-live="polite">
        Checking the current Rules experience.
      </p>
    </main>
  );
}

/**
 * Reversible installed-app chrome cutover for the Rules landing and contextual
 * guidance routes. The canonical Rules components remain the content owner;
 * public web, disabled rollout and probe failures keep the proven legacy shell.
 */
export function V3RulesRouteGate({
  children,
  legacy,
  phaseLabel,
  resolvingTitle = "Opening Rules",
}: {
  children: ReactNode;
  legacy: ReactNode;
  phaseLabel: string;
  resolvingTitle?: string;
}) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);

  if (!platformResolved) return <ResolvingRulesSurface title={resolvingTitle} />;
  if (!isAppMode) return <>{legacy}</>;
  if (rollout.isLoading) return <ResolvingRulesSurface title={resolvingTitle} />;
  if (
    rollout.isError ||
    rollout.data?.enabled !== true ||
    rollout.data?.rulesGuidanceEnabled !== true
  ) {
    return <>{legacy}</>;
  }

  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel={phaseLabel}>
      <div data-v3-rules-guidance-surface="">{children}</div>
    </V3AppShell>
  );
}

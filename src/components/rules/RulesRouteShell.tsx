import type { ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { V3RulesRouteGate } from "@/components/v3/V3RulesRouteGate";

/**
 * Reversible shell bridge for the complete public Rules route family.
 *
 * Rule content stays owned by the existing route/component. Installed-app V3
 * receives only the canonical V3 shell when server rollout authorizes Rules &
 * guidance; web, failed probes and disabled rollout keep the established shell.
 */
export function RulesRouteShell({
  children,
  phaseLabel = "Rules",
  resolvingTitle = "Opening Rules",
}: {
  children: ReactNode;
  phaseLabel?: string;
  resolvingTitle?: string;
}) {
  return (
    <V3RulesRouteGate
      phaseLabel={phaseLabel}
      resolvingTitle={resolvingTitle}
      legacy={<AppShell>{children}</AppShell>}
    >
      {children}
    </V3RulesRouteGate>
  );
}

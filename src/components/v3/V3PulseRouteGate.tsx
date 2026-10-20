import type { ReactNode } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { useV3PublicPulse } from "@/lib/v3-pulse-runtime";
import { V3PulseScreen } from "./V3PulseScreen";

export function V3PulseRouteGate({ fallback }: { fallback: ReactNode }) {
  const rollout = useV3RolloutProbe(true);
  const pulse = useV3PublicPulse(null, true);
  const firstPage = pulse.data?.pages[0];

  if (rollout.isLoading || pulse.isLoading) {
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Pulse" activeArea="home">
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Solaris Pulse</h1>
            <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              Opening published updates…
            </p>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  // Keep the established route as a reversible rollout fallback until the
  // caller-invariant System projection is deployed and the global V3 rollout
  // is enabled. Missing authority never falls back to direct-table V3 reads.
  if (
    rollout.isError ||
    !rollout.data ||
    rollout.data.enabled !== true ||
    pulse.isError ||
    !firstPage ||
    firstPage.schemaReady !== true
  ) {
    return <>{fallback}</>;
  }

  return (
    <V3AppShell editionLabel="Solaris Studio" phaseLabel="Pulse" activeArea="home">
      <V3PulseScreen viewerId={rollout.data.userId ?? null} />
    </V3AppShell>
  );
}

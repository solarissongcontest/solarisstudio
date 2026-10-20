import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { useV3BroadcastIntelligenceBundle } from "@/lib/v3-broadcast-intelligence-runtime";
import {
  useV3EditionRolloutProbe,
  useV3RolloutProbe,
} from "@/lib/v3-primary-runtime";
import { V3BroadcastIntelligenceScreen } from "./V3BroadcastIntelligenceScreen";

const MAX_SHOW_NOMINATION_LENGTH = 120;

function broadcastShowNomination(search: unknown) {
  if (!search || typeof search !== "object" || Array.isArray(search)) return null;
  const raw = (search as Record<string, unknown>).show;
  return typeof raw === "string" && raw.trim()
    ? raw.trim().slice(0, MAX_SHOW_NOMINATION_LENGTH)
    : null;
}

export function V3BroadcastIntelligenceGate({
  fallback,
}: {
  fallback: ReactNode;
}) {
  const navigate = useNavigate();
  const search = useRouterState({ select: (state) => state.location.search });
  const nominatedShowId = broadcastShowNomination(search);
  const bundle = useV3BroadcastIntelligenceBundle(nominatedShowId, true);
  const rolloutEditionSlug = bundle.data?.rolloutEditionSlug ?? "";
  const editionProbe = useV3EditionRolloutProbe(
    rolloutEditionSlug,
    bundle.isSuccess && Boolean(rolloutEditionSlug),
  );
  const currentProbe = useV3RolloutProbe(
    bundle.isSuccess && !rolloutEditionSlug,
  );
  const rollout = rolloutEditionSlug ? editionProbe : currentProbe;
  const authoritativeShowId = bundle.data?.selectedShowId ?? null;
  const nominatedShowMismatch = Boolean(
    bundle.isSuccess &&
      nominatedShowId &&
      nominatedShowId !== authoritativeShowId,
  );

  useEffect(() => {
    if (!nominatedShowMismatch) return;

    void navigate({
      to: "/broadcast-intelligence",
      search: { show: authoritativeShowId ?? undefined } as any,
      replace: true,
    });
  }, [authoritativeShowId, navigate, nominatedShowMismatch]);

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return (
      <V3AppShell
        editionLabel={bundle.data?.shell.editionLabel ?? "Solaris Studio"}
        phaseLabel="Broadcast Intelligence"
        activeArea="results"
      >
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Replay the voting</h1>
            <p
              role="status"
              className="mt-2 text-sm text-[var(--v3-text-secondary)]"
            >
              Preparing the published result replay…
            </p>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    return <>{fallback}</>;
  }

  if (rollout.data.enabled !== true || rollout.data.resultsEnabled !== true) {
    return <>{fallback}</>;
  }

  const changeShow = (showId: string) => {
    if (!showId || showId === bundle.data.selectedShowId) return;
    void navigate({
      to: "/broadcast-intelligence",
      search: { show: showId } as any,
    });
  };

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="results"
    >
      <V3BroadcastIntelligenceScreen
        bundle={bundle.data}
        onShowChange={changeShow}
        changingShow={bundle.isFetching}
      />
    </V3AppShell>
  );
}

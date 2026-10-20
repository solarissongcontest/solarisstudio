import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import {
  useV3EditionRolloutProbe,
  useV3RolloutProbe,
} from "@/lib/v3-primary-runtime";
import { useV3ResultLabBundle } from "@/lib/v3-result-lab-runtime";
import { V3ResultLabScreen } from "./V3ResultLabScreen";

function requestedShowIdFromSearch(search: unknown): string | null {
  if (!search || typeof search !== "object" || Array.isArray(search)) return null;
  const showId = (search as Record<string, unknown>).show;
  return typeof showId === "string" && showId.trim() ? showId.trim() : null;
}

export function V3ResultLabGate({ fallback }: { fallback: ReactNode }) {
  const navigate = useNavigate();
  const search = useRouterState({ select: (state) => state.location.search });
  const requestedShowId = requestedShowIdFromSearch(search);
  const bundle = useV3ResultLabBundle(requestedShowId, true);
  const rolloutEditionSlug = bundle.data?.rolloutEditionSlug ?? "";
  const editionProbe = useV3EditionRolloutProbe(
    rolloutEditionSlug,
    bundle.isSuccess && Boolean(rolloutEditionSlug),
  );
  const currentProbe = useV3RolloutProbe(
    bundle.isSuccess && !rolloutEditionSlug,
  );
  const rollout = rolloutEditionSlug ? editionProbe : currentProbe;

  // Search state only nominates an official source show. The server revalidates
  // that id against eligible published Result Lab inputs. If a direct link asks
  // for anything else, replace the misleading URL with the authoritative show
  // actually returned by the server.
  useEffect(() => {
    const selectedShowId = bundle.data?.selectedShowId ?? null;
    if (!bundle.isSuccess || !requestedShowId || !selectedShowId) return;
    if (selectedShowId === requestedShowId) return;

    void navigate({
      to: "/result-lab",
      search: { show: selectedShowId } as any,
      replace: true,
    });
  }, [bundle.data?.selectedShowId, bundle.isSuccess, navigate, requestedShowId]);

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return (
      <V3AppShell
        editionLabel={bundle.data?.shell.editionLabel ?? "Solaris Studio"}
        phaseLabel="Result Lab"
        activeArea="results"
      >
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Result Lab</h1>
            <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              Loading official inputs for a new simulation…
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
      to: "/result-lab",
      search: { show: showId } as any,
    });
  };

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="results"
    >
      <V3ResultLabScreen
        key={bundle.data.selectedShowId ?? "none"}
        bundle={bundle.data}
        onShowChange={changeShow}
        changingShow={bundle.isFetching}
      />
    </V3AppShell>
  );
}

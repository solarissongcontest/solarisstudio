import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { useV3EditionRolloutProbe, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { useV3ScorechartsBundle } from "@/lib/v3-scorecharts-runtime";
import { V3ScorechartsScreen } from "./V3ScorechartsScreen";

const MAX_SCORECHART_QUERY_LENGTH = 80;

function scorechartsSearchNomination(search: unknown) {
  if (!search || typeof search !== "object" || Array.isArray(search)) {
    return { editionSlug: null as string | null, query: "" };
  }

  const values = search as Record<string, unknown>;
  const editionSlug =
    typeof values.edition === "string" && values.edition.trim()
      ? values.edition.trim()
      : null;
  const query =
    typeof values.q === "string"
      ? values.q.trim().slice(0, MAX_SCORECHART_QUERY_LENGTH)
      : "";

  return { editionSlug, query };
}

export function V3ScorechartsGate({ fallback }: { fallback: ReactNode }) {
  const navigate = useNavigate();
  const search = useRouterState({ select: (state) => state.location.search });
  const nomination = scorechartsSearchNomination(search);
  const bundle = useV3ScorechartsBundle(true);
  const rolloutEditionSlug = bundle.data?.rolloutEditionSlug ?? "";
  const editionProbe = useV3EditionRolloutProbe(
    rolloutEditionSlug,
    bundle.isSuccess && Boolean(rolloutEditionSlug),
  );
  const currentProbe = useV3RolloutProbe(
    bundle.isSuccess && !rolloutEditionSlug,
  );
  const rollout = rolloutEditionSlug ? editionProbe : currentProbe;
  const validEditionSlugs = new Set(
    (bundle.data?.items ?? []).map((item) => item.editionSlug),
  );
  const selectedEditionSlug =
    nomination.editionSlug && validEditionSlugs.has(nomination.editionSlug)
      ? nomination.editionSlug
      : null;
  const invalidEditionNomination = Boolean(
    bundle.isSuccess && nomination.editionSlug && !selectedEditionSlug,
  );

  useEffect(() => {
    if (!invalidEditionNomination) return;

    void navigate({
      to: "/scorecharts",
      search: { q: nomination.query || undefined } as any,
      replace: true,
    });
  }, [invalidEditionNomination, navigate, nomination.query]);

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return (
      <V3AppShell
        editionLabel={bundle.data?.shell.editionLabel ?? "Solaris Studio"}
        phaseLabel="Scorecharts"
        activeArea="results"
      >
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Full Scorecharts</h1>
            <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              Opening published detailed voting…
            </p>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  // Scorecharts is part of the Results ecosystem. It only adopts V3 when the
  // same server-owned Results rollout is resolved and enabled. Any unresolved,
  // failed or disabled authority falls back to the established public route.
  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    return <>{fallback}</>;
  }

  if (rollout.data.enabled !== true || rollout.data.resultsEnabled !== true) {
    return <>{fallback}</>;
  }

  const changeEdition = (editionSlug: string | null) => {
    void navigate({
      to: "/scorecharts",
      search: {
        edition: editionSlug || undefined,
        q: nomination.query || undefined,
      } as any,
    });
  };

  const changeQuery = (query: string) => {
    const normalized = query.slice(0, MAX_SCORECHART_QUERY_LENGTH);
    void navigate({
      to: "/scorecharts",
      search: {
        edition: selectedEditionSlug || undefined,
        q: normalized || undefined,
      } as any,
      replace: true,
    });
  };

  const clearFilters = () => {
    void navigate({
      to: "/scorecharts",
      search: {} as any,
      replace: true,
    });
  };

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="results"
    >
      <V3ScorechartsScreen
        items={bundle.data.items}
        generatedAt={bundle.data.generatedAt}
        selectedEditionSlug={selectedEditionSlug}
        query={nomination.query}
        onEditionChange={changeEdition}
        onQueryChange={changeQuery}
        onClearFilters={clearFilters}
      />
    </V3AppShell>
  );
}

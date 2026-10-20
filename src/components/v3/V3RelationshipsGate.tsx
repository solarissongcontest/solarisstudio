import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { useV3EditionRolloutProbe, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import {
  useV3RelationshipDetailBundle,
  useV3RelationshipsIndexBundle,
} from "@/lib/v3-relationships-runtime";
import { V3RelationshipDetailScreen } from "./V3RelationshipDetailScreen";
import {
  V3RelationshipsIndexScreen,
  type V3RelationshipsIndexTab,
} from "./V3RelationshipsIndexScreen";

const RELATIONSHIP_INDEX_TABS = new Set<V3RelationshipsIndexTab>([
  "all",
  "alliances",
  "rivalries",
  "one-sided",
]);
const MAX_RELATIONSHIP_QUERY_LENGTH = 80;

function relationshipIndexNomination(search: unknown): {
  tab: V3RelationshipsIndexTab;
  query: string;
  hasView: boolean;
  viewValid: boolean;
} {
  if (!search || typeof search !== "object" || Array.isArray(search)) {
    return { tab: "all", query: "", hasView: false, viewValid: true };
  }

  const values = search as Record<string, unknown>;
  const rawView = typeof values.view === "string" ? values.view.trim() : "";
  const hasView = Boolean(rawView);
  const viewValid = !hasView || RELATIONSHIP_INDEX_TABS.has(rawView as V3RelationshipsIndexTab);
  const query =
    typeof values.q === "string"
      ? values.q.trimStart().slice(0, MAX_RELATIONSHIP_QUERY_LENGTH)
      : "";

  return {
    tab: viewValid && hasView ? (rawView as V3RelationshipsIndexTab) : "all",
    query,
    hasView,
    viewValid,
  };
}

function V3RelationshipsLoading({ editionLabel }: { editionLabel?: string }) {
  return (
    <V3AppShell
      editionLabel={editionLabel ?? "Solaris Studio"}
      phaseLabel="Relationships"
      activeArea="results"
    >
      <V3Screen>
        <V3Surface className="p-5">
          <h1 className="text-2xl font-bold">Voting relationships</h1>
          <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
            Calculating published relationship history…
          </p>
        </V3Surface>
      </V3Screen>
    </V3AppShell>
  );
}

export function V3RelationshipsIndexGate({ fallback }: { fallback: ReactNode }) {
  const navigate = useNavigate();
  const search = useRouterState({ select: (state) => state.location.search });
  const nomination = relationshipIndexNomination(search);
  const bundle = useV3RelationshipsIndexBundle(true);
  const rolloutEditionSlug = bundle.data?.rolloutEditionSlug ?? "";
  const editionProbe = useV3EditionRolloutProbe(
    rolloutEditionSlug,
    bundle.isSuccess && Boolean(rolloutEditionSlug),
  );
  const currentProbe = useV3RolloutProbe(
    bundle.isSuccess && !rolloutEditionSlug,
  );
  const rollout = rolloutEditionSlug ? editionProbe : currentProbe;

  useEffect(() => {
    if (nomination.viewValid) return;

    void navigate({
      to: "/relationships",
      search: { q: nomination.query || undefined } as any,
      replace: true,
    });
  }, [navigate, nomination.query, nomination.viewValid]);

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return <V3RelationshipsLoading editionLabel={bundle.data?.shell.editionLabel} />;
  }

  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    return <>{fallback}</>;
  }

  if (rollout.data.enabled !== true || rollout.data.resultsEnabled !== true) {
    return <>{fallback}</>;
  }

  const changeTab = (tab: V3RelationshipsIndexTab) => {
    void navigate({
      to: "/relationships",
      search: {
        view: tab === "all" ? undefined : tab,
        q: nomination.query || undefined,
      } as any,
    });
  };

  const changeQuery = (query: string) => {
    const normalized = query.slice(0, MAX_RELATIONSHIP_QUERY_LENGTH);
    void navigate({
      to: "/relationships",
      search: {
        view: nomination.tab === "all" ? undefined : nomination.tab,
        q: normalized || undefined,
      } as any,
      replace: true,
    });
  };

  const clearFilters = () => {
    void navigate({
      to: "/relationships",
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
      <V3RelationshipsIndexScreen
        pairs={bundle.data.pairs}
        selectedTab={nomination.tab}
        query={nomination.query}
        onTabChange={changeTab}
        onQueryChange={changeQuery}
        onClearFilters={clearFilters}
      />
    </V3AppShell>
  );
}

export function V3RelationshipDetailGate({
  pair,
  fallback,
}: {
  pair: string;
  fallback: ReactNode;
}) {
  const bundle = useV3RelationshipDetailBundle(pair, true);
  const rolloutEditionSlug = bundle.data?.rolloutEditionSlug ?? "";
  const editionProbe = useV3EditionRolloutProbe(
    rolloutEditionSlug,
    bundle.isSuccess && Boolean(rolloutEditionSlug),
  );
  const currentProbe = useV3RolloutProbe(
    bundle.isSuccess && !rolloutEditionSlug,
  );
  const rollout = rolloutEditionSlug ? editionProbe : currentProbe;

  if (bundle.isLoading || (bundle.isSuccess && bundle.data && rollout.isLoading)) {
    return <V3RelationshipsLoading editionLabel={bundle.data?.shell.editionLabel} />;
  }

  if (
    bundle.isError ||
    !bundle.data ||
    rollout.isError ||
    !rollout.data ||
    rollout.data.enabled !== true ||
    rollout.data.resultsEnabled !== true
  ) {
    return <>{fallback}</>;
  }

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="results"
    >
      <V3RelationshipDetailScreen bundle={bundle.data} />
    </V3AppShell>
  );
}

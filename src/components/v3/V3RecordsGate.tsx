import { useNavigate, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { useNotificationPreferences } from "@/lib/engagement-data";
import { useV3EditionRolloutProbe, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import type { V3RecordCategoryFilter } from "@/lib/v3-records";
import { useV3RecordsBundle } from "@/lib/v3-records-runtime";
import { resolveV3ResultsSpoilerProtection } from "@/lib/v3-results";
import { V3RecordsScreen } from "./V3RecordsScreen";

const RECORD_CATEGORIES = new Set<V3RecordCategoryFilter>([
  "career",
  "streaks",
  "edition",
  "voting",
  "regional",
  "unusual",
  "all",
]);

function categoryFromSearch(search: unknown): {
  category: V3RecordCategoryFilter;
  hasParam: boolean;
  valid: boolean;
} {
  if (!search || typeof search !== "object" || Array.isArray(search)) {
    return { category: "career", hasParam: false, valid: true };
  }

  const raw = (search as Record<string, unknown>).category;
  const hasParam = typeof raw === "string" && raw.length > 0;
  const valid = !hasParam || RECORD_CATEGORIES.has(raw as V3RecordCategoryFilter);
  return {
    category: valid && hasParam ? (raw as V3RecordCategoryFilter) : "career",
    hasParam,
    valid,
  };
}

export function V3RecordsGate({ fallback }: { fallback: ReactNode }) {
  const { preferences } = useAppExperiencePreferences();
  const navigate = useNavigate();
  const search = useRouterState({ select: (state) => state.location.search });
  const categoryNomination = categoryFromSearch(search);
  const [currentEditionRevealed, setCurrentEditionRevealed] = useState(false);
  const bundle = useV3RecordsBundle(true);
  const rolloutEditionSlug = bundle.data?.rolloutEditionSlug ?? "";
  const editionProbe = useV3EditionRolloutProbe(
    rolloutEditionSlug,
    bundle.isSuccess && Boolean(rolloutEditionSlug),
  );
  const currentProbe = useV3RolloutProbe(
    bundle.isSuccess && !rolloutEditionSlug,
  );
  const rollout = rolloutEditionSlug ? editionProbe : currentProbe;
  const serverPreferences = useNotificationPreferences(rollout.data?.userId ?? undefined);

  useEffect(() => {
    setCurrentEditionRevealed(false);
  }, [bundle.data?.currentEditionId]);

  useEffect(() => {
    if (!categoryNomination.hasParam) return;
    if (categoryNomination.valid && categoryNomination.category !== "career") return;

    void navigate({
      to: "/records",
      search: {} as any,
      replace: true,
    });
  }, [
    categoryNomination.category,
    categoryNomination.hasParam,
    categoryNomination.valid,
    navigate,
  ]);

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return (
      <V3AppShell
        editionLabel={bundle.data?.shell.editionLabel ?? "Solaris Studio"}
        phaseLabel="Records"
        activeArea="results"
      >
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Records</h1>
            <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              Calculating records from the published archive…
            </p>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  // Records is a derived Results surface. It adopts V3 only when canonical
  // Results rollout authority is resolved and enabled; every other state keeps
  // the established route available as a reversible fallback.
  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    return <>{fallback}</>;
  }

  if (rollout.data.enabled !== true || rollout.data.resultsEnabled !== true) {
    return <>{fallback}</>;
  }

  const hideSpoilers = resolveV3ResultsSpoilerProtection({
    localSpoilerFree: preferences.spoilerFree,
    viewerResolved: true,
    viewerId: rollout.data.userId ?? null,
    serverPending: serverPreferences.isPending,
    serverError: serverPreferences.isError,
    serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null,
  });
  const spoilerProtected =
    hideSpoilers &&
    !currentEditionRevealed &&
    bundle.data.currentEditionAffectsRecords;

  const changeCategory = (category: V3RecordCategoryFilter) => {
    if (category === categoryNomination.category) return;
    void navigate({
      to: "/records",
      search: { category: category === "career" ? undefined : category } as any,
    });
  };

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel}
      activeArea="results"
    >
      <V3RecordsScreen
        key={`${bundle.data.currentEditionId ?? "none"}:${spoilerProtected}`}
        records={spoilerProtected ? bundle.data.spoilerSafeRecords : bundle.data.records}
        editionHrefById={bundle.data.editionHrefById}
        archivedFinalEditions={
          spoilerProtected
            ? bundle.data.spoilerSafeArchivedFinalEditions
            : bundle.data.archivedFinalEditions
        }
        generatedAt={bundle.data.generatedAt}
        spoilerProtected={spoilerProtected}
        onRevealCurrentEdition={() => setCurrentEditionRevealed(true)}
        selectedCategory={categoryNomination.category}
        onCategoryChange={changeCategory}
      />
    </V3AppShell>
  );
}

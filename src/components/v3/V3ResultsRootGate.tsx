import { useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { V3AppShell } from "@/components/v3/V3AppShell";
import { V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { V3ResultsScreen } from "@/components/v3/V3ResultsScreen";
import { useAppExperiencePreferences } from "@/lib/app-experience";
import { useMyCountryAccount } from "@/lib/country-account";
import { useNotificationPreferences } from "@/lib/engagement-data";
import { useV3EditionRolloutProbe, useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import {
  resolveV3ResultsSpoilerProtection,
  type V3ResultMode,
} from "@/lib/v3-results";
import { useV3ResultsBundle } from "@/lib/v3-results-runtime";

const MAX_RESULTS_SHOW_NOMINATION_LENGTH = 120;

type ResultsSearchNomination = {
  showId: string | null;
  mode: V3ResultMode;
  hasModeParam: boolean;
  modeValid: boolean;
};

function resultsSearchNomination(search: unknown): ResultsSearchNomination {
  if (!search || typeof search !== "object" || Array.isArray(search)) {
    return { showId: null, mode: "combined", hasModeParam: false, modeValid: true };
  }

  const values = search as Record<string, unknown>;
  const showId =
    typeof values.show === "string" && values.show.trim()
      ? values.show.trim().slice(0, MAX_RESULTS_SHOW_NOMINATION_LENGTH)
      : null;
  const hasModeParam = typeof values.mode === "string" && values.mode.length > 0;
  const mode = values.mode;
  const modeValid =
    !hasModeParam || mode === "combined" || mode === "jury" || mode === "televote";

  return {
    showId,
    mode: mode === "jury" || mode === "televote" ? mode : "combined",
    hasModeParam,
    modeValid,
  };
}

function publishedMode(
  requested: V3ResultMode,
  input: { juryPublished: boolean; televotePublished: boolean } | null | undefined,
): V3ResultMode {
  if (requested === "jury" && input?.juryPublished === true) return "jury";
  if (requested === "televote" && input?.televotePublished === true) return "televote";
  return "combined";
}

export function V3ResultsRootGate({ fallback }: { fallback: ReactNode }) {
  const { preferences } = useAppExperiencePreferences();
  const navigate = useNavigate();
  const search = useRouterState({ select: (state) => state.location.search });
  const nomination = resultsSearchNomination(search);
  const bundle = useV3ResultsBundle(nomination.showId, true);
  const countryAccount = useMyCountryAccount();
  const [revealedShowId, setRevealedShowId] = useState<string | null>(null);
  const editionSlug = bundle.data?.editionSlug ?? "";
  const editionProbe = useV3EditionRolloutProbe(
    editionSlug,
    bundle.isSuccess && Boolean(editionSlug),
  );
  const currentProbe = useV3RolloutProbe(
    bundle.isSuccess && !editionSlug,
  );
  const rollout = editionSlug ? editionProbe : currentProbe;
  const serverPreferences = useNotificationPreferences(rollout.data?.userId ?? undefined);
  const selectedMode = publishedMode(nomination.mode, bundle.data?.input);

  const countries = useMemo(
    () => new Map((bundle.data?.countries ?? []).map((country) => [country.id, country])),
    [bundle.data?.countries],
  );

  // Browser search state only nominates a public result and an already-published
  // layer. The server owns Show selection and publication. Canonicalize invalid
  // or stale nominations after that authoritative response so refresh/share/back
  // navigation always describes the data actually rendered.
  useEffect(() => {
    const selectedShowId = bundle.data?.input.showId ?? "";
    if (!bundle.isSuccess || !selectedShowId) return;

    const shouldPinShow = Boolean(nomination.showId || nomination.hasModeParam);
    const showMismatch = shouldPinShow && nomination.showId !== selectedShowId;
    const modeMismatch = !nomination.modeValid || nomination.mode !== selectedMode;
    if (!showMismatch && !modeMismatch) return;

    void navigate({
      to: "/results",
      search: {
        show: shouldPinShow ? selectedShowId : undefined,
        mode: selectedMode === "combined" ? undefined : selectedMode,
      } as any,
      replace: true,
    });
  }, [
    bundle.data?.input.showId,
    bundle.isSuccess,
    navigate,
    nomination.hasModeParam,
    nomination.mode,
    nomination.modeValid,
    nomination.showId,
    selectedMode,
  ]);

  if (bundle.isLoading || (bundle.isSuccess && rollout.isLoading)) {
    return (
      <V3AppShell editionLabel="Solaris Studio" phaseLabel="Results" activeArea="results">
        <V3Screen>
          <V3Surface className="p-5">
            <h1 className="text-2xl font-bold">Results</h1>
            <p role="status" className="mt-2 text-sm text-[var(--v3-text-secondary)]">
              Opening published results…
            </p>
          </V3Surface>
        </V3Screen>
      </V3AppShell>
    );
  }

  // V3 never takes authority from an unresolved or failed public bundle. The
  // established route remains available as a reversible rollout fallback.
  if (bundle.isError || !bundle.data || rollout.isError || !rollout.data) {
    return <>{fallback}</>;
  }

  const v3Enabled = rollout.data.enabled === true && rollout.data.resultsEnabled === true;
  if (!v3Enabled) return <>{fallback}</>;

  const hideSpoilers = resolveV3ResultsSpoilerProtection({
    localSpoilerFree: preferences.spoilerFree,
    viewerResolved: true,
    viewerId: rollout.data.userId ?? null,
    serverPending: serverPreferences.isPending,
    serverError: serverPreferences.isError,
    serverSpoilerFree: serverPreferences.data?.spoiler_free ?? null,
  });

  const viewerCountryId =
    rollout.data.userId &&
    !countryAccount.isPending &&
    !countryAccount.isError &&
    countryAccount.data?.access.userId === rollout.data.userId
      ? countryAccount.data.access.countryId
      : null;
  const activeShowId = bundle.data.input.showId || null;
  const resultRevealed = Boolean(activeShowId && revealedShowId === activeShowId);

  const changeResult = (showId: string) => {
    if (!showId || showId === bundle.data.input.showId) return;
    void navigate({
      to: "/results",
      search: {
        show: showId,
        mode: selectedMode === "combined" ? undefined : selectedMode,
      } as any,
    });
  };

  const changeMode = (mode: V3ResultMode) => {
    if (mode === selectedMode) return;
    void navigate({
      to: "/results",
      search: {
        show: bundle.data.input.showId || undefined,
        mode: mode === "combined" ? undefined : mode,
      } as any,
    });
  };

  return (
    <V3AppShell
      editionLabel={bundle.data.shell.editionLabel}
      phaseLabel={bundle.data.shell.phaseLabel ?? "Results"}
      activeArea="results"
    >
      <V3ResultsScreen
        key={`${rollout.data.userId ?? "anonymous"}:${bundle.data.input.showId || "none"}:${hideSpoilers}`}
        countries={countries}
        hideSpoilers={hideSpoilers}
        input={{
          ...bundle.data.input,
          userDelegationCountryId: viewerCountryId,
        }}
        options={bundle.data.options}
        changingResult={bundle.isFetching}
        onResultChange={changeResult}
        selectedMode={selectedMode}
        onModeChange={changeMode}
        revealed={resultRevealed}
        onReveal={() => setRevealedShowId(activeShowId)}
      />
    </V3AppShell>
  );
}
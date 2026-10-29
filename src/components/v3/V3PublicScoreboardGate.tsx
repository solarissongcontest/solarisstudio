import type { ReactNode } from "react";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { PublicDataState } from "@/components/public/PublicDataState";
import type { V3ScoreboardPresentationProps } from "./V3ScoreboardPresentation";
import { V3ScoreboardPresentation } from "./V3ScoreboardPresentation";
import { useV3RolloutProbe } from "@/lib/v3-primary-runtime";
import { useV3PublicScoreboard } from "@/lib/v3-public-scoreboard-runtime";

/** Owns only the published show scoreboard, never voting or result calculation.
 * The legacy component is selected only by an explicit server-disabled rollout. */
export function V3PublicScoreboardGate({
  showId,
  countries,
  participants,
  qualifiers,
  fallback,
}: Omit<V3ScoreboardPresentationProps, "standings"> & { showId: string; fallback: ReactNode }) {
  const { isAppMode, platformResolved } = useSolarisApp();
  const rollout = useV3RolloutProbe(platformResolved && isAppMode);
  const enabled =
    platformResolved &&
    isAppMode &&
    rollout.data?.enabled === true &&
    rollout.data?.scoreboardEnabled === true;
  const snapshot = useV3PublicScoreboard(showId, enabled);

  if (platformResolved && !isAppMode) return <>{fallback}</>;
  if (!platformResolved || rollout.isLoading)
    return <PublicDataState kind="loading" title="Loading scoreboard" />;
  if (rollout.isError || !rollout.data)
    return <PublicDataState kind="error" title="Scoreboard unavailable" />;
  if (!enabled) return <>{fallback}</>;
  if (snapshot.isLoading)
    return <PublicDataState kind="loading" title="Loading published scoreboard" />;
  if (snapshot.isError)
    return <PublicDataState kind="error" title="Published scoreboard unavailable" />;

  return (
    <div
      data-v3-scoreboard-result-version={snapshot.data?.resultVersion}
      data-v3-scoreboard-publication-version={snapshot.data?.publicationVersion}
    >
      <V3ScoreboardPresentation
        countries={countries}
        participants={participants}
        qualifiers={qualifiers}
        standings={(snapshot.data?.rows ?? []).flatMap((row) =>
          row.final_rank === null
            ? []
            : [
                {
                  countryId: row.contest_entity_id ?? row.country_id,
                  rank: row.final_rank,
                  total: row.total_points,
                  jury: snapshot.data?.availability.jury === true ? row.jury_points : 0,
                  televote: snapshot.data?.availability.televote === true ? row.televote_points : 0,
                  topPoints: 0,
                },
              ],
        )}
      />
    </div>
  );
}

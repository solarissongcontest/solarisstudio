import type { V3PublishedResultSnapshot } from "./v3-public-result-snapshot";
import { hasMultipleTelevoteRounds, parseTelevoteComponents, type VotingConfig } from "./voting";

type PublishedScores = Pick<V3PublishedResultSnapshot, "availability" | "rows">;

export type V3PublicShowResultVisibility = {
  jury: boolean;
  televote: boolean;
  multiRoundTelevote: boolean;
};

/**
 * Publication controls disclosure and voting config controls whether a
 * channel actually voted. Round views additionally require complete
 * immutable published round components, never synthetic zero values.
 */
export function resolveV3PublicShowResultVisibility(
  snapshot: PublishedScores | null | undefined,
  voting: VotingConfig,
): V3PublicShowResultVisibility {
  if (!snapshot || snapshot.rows.length === 0) {
    return { jury: false, televote: false, multiRoundTelevote: false };
  }

  const jury =
    voting.juryEnabled &&
    snapshot.availability.jury &&
    snapshot.rows.every((row) => row.juryPoints != null);
  const televote =
    voting.televoteEnabled &&
    snapshot.availability.televote &&
    snapshot.rows.every((row) => row.televotePoints != null);

  const multiRoundTelevote =
    televote &&
    !voting.juryEnabled &&
    hasMultipleTelevoteRounds(voting) &&
    snapshot.availability.detailedVoting &&
    snapshot.rows.every((row) => {
      const components = parseTelevoteComponents(row.televoteComponents);
      return voting.televoteRounds.every(
        (round) => components.filter((component) => component.round_id === round.id).length === 1,
      );
    });

  return { jury, televote, multiRoundTelevote };
}

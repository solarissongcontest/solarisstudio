/**
 * Public V3 scoreboards only display an advancement outcome when the show's
 * qualification outcome is public and the canonical participant already has
 * an explicit decision. An ordinal rank is not permission to declare a country
 * qualified: ties, wildcards and later organizer decisions can change that.
 *
 * The caller is responsible for the show/publication boundary. A positive
 * qualifierCount means this published scoreboard has a qualifying stage.
 */
export type PublishedScoreboardAdvancement = "qualified" | "eliminated" | null;

export function resolvePublishedScoreboardAdvancement(
  qualifierCount: number | null | undefined,
  participantQualified: boolean | null | undefined,
): PublishedScoreboardAdvancement {
  if (
    typeof qualifierCount !== "number" ||
    !Number.isFinite(qualifierCount) ||
    qualifierCount <= 0
  ) {
    return null;
  }

  if (participantQualified === true) return "qualified";
  if (participantQualified === false) return "eliminated";
  return null;
}

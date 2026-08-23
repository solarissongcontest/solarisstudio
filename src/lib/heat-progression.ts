import type { Show } from "./data";

export type HeatProgressionOutcome = "qualifier" | "nq";

/**
 * Read the configured number of qualifiers from the same sources used by the
 * voting/qualification system. The voting config wins when it has a usable
 * value; qualifier_count remains the legacy fallback.
 */
export function heatQualifierCutoff(show: Pick<Show, "qualifier_count" | "voting_config">) {
  const raw = show.voting_config?.["qualifiers"];
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, Math.trunc(raw));
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) return Number(raw.trim());
  return Math.max(0, show.qualifier_count ?? 0);
}

/**
 * Resolve a completed heat result into the route it should take next.
 * Unknown/unranked results and heats without a configured cutoff are left
 * unresolved rather than guessed.
 */
export function heatProgressionOutcome(
  show: Pick<Show, "qualifier_count" | "voting_config">,
  rank: number | null | undefined,
): HeatProgressionOutcome | null {
  const cutoff = heatQualifierCutoff(show);
  if (cutoff <= 0 || rank == null || !Number.isFinite(rank) || rank < 1) return null;
  return rank <= cutoff ? "qualifier" : "nq";
}

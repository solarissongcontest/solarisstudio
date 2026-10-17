import type { VotingLabBallot } from "@/lib/voting-lab";

export const VOTING_LAB_SYNTHETIC_SCENARIOS = [
  {
    id: "balanced",
    label: "Balanced rotation",
    description: "Each synthetic ballot rotates a 6–5–4–3–2 distribution across the entry pool.",
  },
  {
    id: "concentrated",
    label: "Concentrated favorite",
    description: "Each synthetic ballot gives one rotating favorite 10 points, then 4–3–2–1 to four others.",
  },
  {
    id: "polarized",
    label: "Polarized blocs",
    description: "Two synthetic blocs prefer opposite ends of the entry pool while still obeying the 20-point baseline.",
  },
] as const;

export type VotingLabSyntheticScenario = (typeof VOTING_LAB_SYNTHETIC_SCENARIOS)[number]["id"];

const BALANCED_POINTS = [6, 5, 4, 3, 2] as const;
const CONCENTRATED_POINTS = [10, 4, 3, 2, 1] as const;

function uniqueIds(countryIds: readonly string[]) {
  return [...new Set(countryIds.map((id) => id.trim()).filter(Boolean))];
}

function rotate<T>(items: readonly T[], offset: number) {
  if (!items.length) return [] as T[];
  const normalized = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

export function buildSyntheticVotingLabBallots(
  countryIds: readonly string[],
  scenario: VotingLabSyntheticScenario,
  requestedBallots = 24,
): VotingLabBallot[] {
  const entries = uniqueIds(countryIds);
  if (entries.length < 5) return [];

  const ballotCount = Math.max(1, Math.min(200, Math.trunc(requestedBallots) || 1));

  return Array.from({ length: ballotCount }, (_, index) => {
    let order: string[];
    let points: readonly number[];

    if (scenario === "balanced") {
      order = rotate(entries, index);
      points = BALANCED_POINTS;
    } else if (scenario === "concentrated") {
      order = rotate(entries, index % entries.length);
      points = CONCENTRATED_POINTS;
    } else {
      const bloc = index % 2 === 0 ? entries : [...entries].reverse();
      order = rotate(bloc, Math.floor(index / 2));
      points = CONCENTRATED_POINTS;
    }

    return {
      id: `synthetic-${scenario}-${index + 1}`,
      voterId: `synthetic-voter-${index + 1}`,
      awards: order.slice(0, 5).map((countryId, awardIndex) => ({
        countryId,
        points: points[awardIndex],
      })),
    };
  });
}

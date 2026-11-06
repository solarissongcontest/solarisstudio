import type { TelevotingVoteInput } from "./vote.functions";

// Exactly 20 total points, each selected target scoring at least 1 point,
// means no valid ballot can contain more than 20 selected entries.
export const MAX_TELEVOTE_BALLOT_ENTRIES = 20;

export function validateBallot(data: TelevotingVoteInput) {
  if (!data?.roundId) throw new Error("Missing round");
  const username = String(data?.username ?? "").trim();
  if (username.length < 2 || username.length > 40)
    throw new Error("Username must be 2–40 characters");
  if (!data?.countryCode) throw new Error("Home country required");

  // Do not traverse unbounded attacker-supplied lists to discover that the
  // ballot's total-point invariant makes them impossible.
  if (
    !Array.isArray(data.entries) ||
    data.entries.length < 5 ||
    data.entries.length > MAX_TELEVOTE_BALLOT_ENTRIES
  ) {
    throw new Error("Vote for 5 to 20 entries");
  }

  // Shape-check first, before totaling values. Untrusted JSON cannot rely on
  // the TypeScript signature and must not coerce strings into ballot points.
  if (
    data.entries.some(
      (entry) =>
        !entry ||
        typeof entry.target_country_code !== "string" ||
        !entry.target_country_code ||
        !Number.isInteger(entry.points) ||
        entry.points < 1 ||
        entry.points > 10,
    )
  ) {
    throw new Error("Each selected entry must receive between 1 and 10 points");
  }

  const total = data.entries.reduce((sum, entry) => sum + entry.points, 0);
  if (total !== 20) throw new Error("You must distribute exactly 20 points");
  if (
    new Set(data.entries.map((entry) => entry.target_country_code)).size !==
    data.entries.length
  ) {
    throw new Error("Duplicate voting entry");
  }

  return { ...data, username };
}

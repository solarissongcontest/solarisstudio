import type { JuryVote, Show, Televote, Voter } from "@/lib/data";
import { resolveVoting } from "@/lib/voting";
import type { ReadinessItem } from "./admin-readiness";

export function voteReadiness(show: Show | null, voters: Voter[], jury: JuryVote[], tele: Televote[]): ReadinessItem[] {
  if (!show) return [];
  const items: ReadinessItem[] = [];
  const cfg = resolveVoting(show.voting_config);
  if (cfg.juryEnabled) {
    const rows = cfg.juryPoints.length;
    const done = voters.filter((voter) => jury.filter((vote) => (vote.voter_id ?? vote.voter_country_id) === (voter.id ?? voter.country_id)).length >= rows).length;
    if (voters.length && done < voters.length) items.push({ id: "jury", level: "action", title: `${done}/${voters.length} juries complete`, detail: `${voters.length - done} still need full ballots.` });
  }
  if (cfg.televoteEnabled && !tele.length) items.push({ id: "tele", level: "action", title: "No televote data yet", detail: "Enter or import televote data." });
  return items;
}

import { supabase } from "@/integrations/supabase/client";
import type { VotingTaskInput } from "@/lib/participation-os";

/**
 * Resolve the signed-in delegation's actionable jury window for one edition.
 *
 * This is intentionally shared by Home and MySolaris so the two participant
 * surfaces cannot drift into different interpretations of jury availability.
 */
export async function loadCountryJuryVotingTask(
  editionId: string,
): Promise<VotingTaskInput | null> {
  const { data, error } = await (supabase as any).rpc(
    "country_jury_voting_context",
  );

  if (error) throw error;
  if (!data?.ok) return null;

  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  const round = rounds.find(
    (candidate: any) =>
      candidate.edition_id === editionId &&
      candidate.status === "open" &&
      candidate.eligible,
  );

  if (!round) return null;

  return {
    id: String(round.show_id ?? round.show_name ?? "jury"),
    title: `${String(round.show_name ?? "Jury voting")} jury ballot`,
    route: "/jury-voting",
    eligible: true,
    submitted: round.already_submitted === true,
    status: "open",
    opensAt:
      typeof round.opened_at === "string" ? round.opened_at : null,
    closesAt:
      typeof round.closes_at === "string" ? round.closes_at : null,
    required: true,
  };
}

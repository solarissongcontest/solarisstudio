import { supabase } from "@/integrations/supabase/client";
import type { JuryVote, Voter } from "@/lib/data";

/** Organizer-private, edition/show-scoped reads. Database RLS and the signed-in
 * Supabase client remain the authority. UI query keys never authorize reads.
 */
export async function loadOrganizerJuryVoteRows(editionId: string, showId: string): Promise<JuryVote[]> {
  if (!editionId || !showId) throw new Error("Organizer Jury vote scope is required");
  const { data, error } = await supabase
    .from("jury_votes")
    .select("*")
    .eq("edition_id", editionId)
    .eq("show_id", showId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    receiving_country_id: row.receiving_country_id ?? row.receiving_entity_id ?? "",
  })) as JuryVote[];
}

export async function loadOrganizerShowVoterRows(editionId: string, showId: string): Promise<Voter[]> {
  if (!editionId || !showId) throw new Error("Organizer Jury roster scope is required");
  const { data, error } = await supabase
    .from("voters")
    .select("*")
    .eq("edition_id", editionId)
    .eq("show_id", showId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as Voter[];
}

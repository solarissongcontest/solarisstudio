import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadHodResolverServer } from "@/integrations/unified/hod-history.server";

export type CanonicalJuryVote = {
  id: string;
  edition_id: string;
  show_id: string | null;
  voter_country_id: string | null;
  receiving_country_id: string | null;
  points: number;
};

export async function loadCanonicalVotingContextServer() {
  const db = supabaseAdmin as any;
  const hod = await loadHodResolverServer();
  const [linksResult, bindingsResult, juryResult, participantsResult, showsResult] = await Promise.all([
    db
      .from("integration_links")
      .select("solaris_id,remote_id,edition_id")
      .eq("service", "televoting")
      .eq("entity_type", "edition"),
    db
      .from("televoting_round_bindings")
      .select("remote_round_id,remote_edition_id,edition_id,show_id,source_mode,frozen_at,last_synced_at,last_synced_revision"),
    db
      .from("jury_votes")
      .select("id,edition_id,show_id,voter_country_id,receiving_country_id,points"),
    db
      .from("participants")
      .select("edition_id,show_id,country_id,participation_status,running_order"),
    db.from("shows").select("id,edition_id,name,kind,sort_order,status"),
  ]);

  for (const result of [linksResult, bindingsResult, juryResult, participantsResult, showsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const remoteEditionToCanonical = new Map<string, string>();
  const canonicalEditionToRemote = new Map<string, string>();
  for (const link of linksResult.data ?? []) {
    remoteEditionToCanonical.set(String(link.remote_id), String(link.solaris_id));
    canonicalEditionToRemote.set(String(link.solaris_id), String(link.remote_id));
  }

  const roundBindings = new Map<string, any>();
  for (const binding of bindingsResult.data ?? []) {
    roundBindings.set(String(binding.remote_round_id), binding);
  }

  const participantsByShow = new Map<string, Set<string>>();
  const editionParticipants = new Map<string, Set<string>>();
  for (const participant of participantsResult.data ?? []) {
    if (!participant.country_id) continue;
    if (participant.participation_status && participant.participation_status !== "confirmed") continue;
    const editionSet = editionParticipants.get(String(participant.edition_id)) ?? new Set<string>();
    editionSet.add(String(participant.country_id));
    editionParticipants.set(String(participant.edition_id), editionSet);
    if (participant.show_id) {
      const showSet = participantsByShow.get(String(participant.show_id)) ?? new Set<string>();
      showSet.add(String(participant.country_id));
      participantsByShow.set(String(participant.show_id), showSet);
    }
  }

  const showsById = new Map((showsResult.data ?? []).map((show: any) => [String(show.id), show]));
  const showsByEdition = new Map<string, any[]>();
  for (const show of showsResult.data ?? []) {
    const list = showsByEdition.get(String(show.edition_id)) ?? [];
    list.push(show);
    showsByEdition.set(String(show.edition_id), list);
  }

  return {
    db,
    hod,
    juryVotes: (juryResult.data ?? []) as CanonicalJuryVote[],
    remoteEditionToCanonical,
    canonicalEditionToRemote,
    roundBindings,
    participantsByShow,
    editionParticipants,
    showsById,
    showsByEdition,
  };
}

export function canonicalEditionForRound(
  context: Awaited<ReturnType<typeof loadCanonicalVotingContextServer>>,
  round: { id: string; edition_id: string },
) {
  const binding = context.roundBindings.get(round.id);
  return binding?.edition_id
    ? String(binding.edition_id)
    : context.remoteEditionToCanonical.get(round.edition_id) ?? null;
}

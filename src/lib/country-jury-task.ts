import { supabase } from "@/integrations/supabase/client";
import type { VotingTaskInput } from "@/lib/participation-os";

export type CountryJuryVotingState = VotingTaskInput & {
  showName: string;
};

/**
 * Resolve the signed-in delegation's jury state for one edition.
 *
 * Home and MySolaris deliberately share this function so one surface cannot
 * call the ballot "ready" while another knows the official window is closed.
 */
export async function loadCountryJuryVotingState(
  editionId: string,
): Promise<CountryJuryVotingState | null> {
  const { data, error } = await (supabase as any).rpc(
    "country_jury_voting_context",
  );

  if (error) throw error;
  if (!data?.ok) return null;

  const rounds = Array.isArray(data.rounds) ? data.rounds : [];
  const editionRounds = rounds.filter(
    (candidate: any) => candidate.edition_id === editionId,
  );
  if (!editionRounds.length) return null;

  const round =
    editionRounds.find(
      (candidate: any) => candidate.status === "open" && candidate.eligible,
    ) ??
    editionRounds.find((candidate: any) => candidate.already_submitted === true) ??
    editionRounds.find((candidate: any) => candidate.eligible) ??
    editionRounds[0];

  const showName = String(round.show_name ?? "Jury voting");
  return {
    id: String(round.show_id ?? round.show_name ?? "jury"),
    showName,
    title: `${showName} jury ballot`,
    route: "/jury-voting",
    eligible: round.eligible === true,
    submitted: round.already_submitted === true,
    status: typeof round.status === "string" ? round.status : null,
    opensAt:
      typeof round.opened_at === "string" ? round.opened_at : null,
    closesAt:
      typeof round.closes_at === "string" ? round.closes_at : null,
    required: true,
  };
}

/**
 * Actionable task projection. Closed or ineligible windows are state, not work.
 */
export async function loadCountryJuryVotingTask(
  editionId: string,
): Promise<VotingTaskInput | null> {
  const state = await loadCountryJuryVotingState(editionId);
  if (!state || !state.eligible || state.status !== "open") return null;
  return state;
}

import { televotingAdmin } from "@/integrations/televoting/client.server";

export type HistoricalTelevoteObservationRow = {
  source_key: string;
  solaris_edition_id: string;
  edition_number: number | null;
  round_key: string;
  round_name: string;
  voter_country_code: string;
  target_country_code: string;
  score: number;
};

/**
 * Exact legacy country-level televote observations that cannot safely live in
 * the modern vote_entries table because historical editions used different
 * score scales. These rows are server-only analytics inputs; they never alter
 * official round results.
 */
export async function loadHistoricalTelevoteObservationsServer() {
  const { data, error } = await televotingAdmin
    .from("historical_vote_observations")
    .select(
      "source_key,solaris_edition_id,edition_number,round_key,round_name,voter_country_code,target_country_code,score",
    )
    .order("edition_number", { ascending: true })
    .order("source_key", { ascending: true })
    .order("voter_country_code", { ascending: true })
    .order("target_country_code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as HistoricalTelevoteObservationRow[];
}

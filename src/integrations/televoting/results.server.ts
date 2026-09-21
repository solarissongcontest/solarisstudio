import { televotingPublicServer } from "@/integrations/televoting/public.server";

type TelevotingClient = typeof televotingPublicServer;

export type PublishedResultRow = {
  entry_key: string;
  country_code: string | null;
  original_votes: number;
  final_points: number;
  original_rank: number | null;
  robust_rank?: number;
  effective_points?: number;
  effective_supporters?: number;
  breadth_factor?: number;
  robust_support?: number;
  rank_boost?: number;
  rank_factor?: number;
  weighted_score?: number;
  exact_points?: number;
  floored_points?: number;
  decimal_remainder?: number;
  remainder_bonus?: number;
};

export type PublishedResultsPayload = {
  round: {
    id: string;
    name: string;
    edition: string | null;
    total_points: number;
    calculated_at: string | null;
    version: number;
    engine_version: string;
    advanced: boolean;
    broadcast_mode: "original" | "converted" | "combined";
  } | null;
  rows: PublishedResultRow[];
};

type RawPublishedResultRow = {
  entry_key?: string | null;
  country_code?: string | null;
  original_votes?: number | string | null;
  final_points?: number | string | null;
  original_rank?: number | string | null;
  robust_rank?: number | string | null;
  effective_points?: number | string | null;
  effective_supporters?: number | string | null;
  breadth_factor?: number | string | null;
  robust_support?: number | string | null;
  rank_boost?: number | string | null;
  rank_factor?: number | string | null;
  weighted_score?: number | string | null;
  exact_points?: number | string | null;
  floored_points?: number | string | null;
  decimal_remainder?: number | string | null;
  remainder_bonus?: number | string | null;
};

async function readPublishedResults(
  client: TelevotingClient,
  roundId?: string,
): Promise<PublishedResultsPayload> {
  const selection =
    "id,name,results_status,total_points_to_distribute,rank_exponent,televote_engine_version,calculated_at,calculation_version,public_advanced_transparency,broadcast_display_mode,editions(name)";

  let query = client
    .from("rounds")
    .select(selection)
    .eq("results_status", "published")
    .order("closed_at", { ascending: false })
    .limit(1);

  if (roundId) {
    query = client
      .from("rounds")
      .select(selection)
      .eq("results_status", "published")
      .eq("id", roundId)
      .limit(1);
  }

  const { data: rounds, error } = await query;
  if (error) throw new Error(error.message);

  const round = (rounds ?? [])[0] as unknown as {
    id: string;
    name: string;
    total_points_to_distribute: number;
    televote_engine_version: string | null;
    calculated_at: string | null;
    calculation_version: number;
    public_advanced_transparency: boolean | null;
    broadcast_display_mode: "original" | "converted" | "combined" | null;
    editions: { name: string } | Array<{ name: string }> | null;
  } | undefined;

  if (!round) return { round: null, rows: [] };

  const editionRelation = round.editions;
  const editionName = Array.isArray(editionRelation)
    ? editionRelation[0]?.name ?? null
    : editionRelation?.name ?? null;

  const { data: results, error: resultError } = await client
    .from("round_results")
    .select("*")
    .eq("round_id", round.id)
    .order("final_points", { ascending: false });
  if (resultError) throw new Error(resultError.message);

  const advanced = Boolean(round.public_advanced_transparency);
  const robust = round.televote_engine_version === "robust-televote-v2";
  const rows: PublishedResultRow[] = ((results ?? []) as RawPublishedResultRow[]).map(
    (result) => ({
      entry_key: String(result.entry_key ?? result.country_code ?? ""),
      country_code: result.country_code ? String(result.country_code) : null,
      original_votes: Number(result.original_votes ?? 0),
      final_points: Number(result.final_points ?? 0),
      original_rank: result.original_rank == null ? null : Number(result.original_rank),
      ...(advanced && robust
        ? {
            robust_rank: Number(result.robust_rank ?? 0),
            effective_points: Number(result.effective_points ?? 0),
            effective_supporters: Number(result.effective_supporters ?? 0),
            breadth_factor: Number(result.breadth_factor ?? 0),
            robust_support: Number(result.robust_support ?? 0),
            rank_boost: Number(result.rank_boost ?? 0),
            weighted_score: Number(result.weighted_score ?? 0),
            exact_points: Number(result.exact_points ?? 0),
            floored_points: Number(result.floored_points ?? 0),
            decimal_remainder: Number(result.decimal_remainder ?? 0),
            remainder_bonus: Number(result.remainder_bonus ?? 0),
          }
        : advanced
          ? {
              rank_factor: Number(result.rank_factor ?? 0),
              weighted_score: Number(result.weighted_score ?? 0),
              exact_points: Number(result.exact_points ?? 0),
              floored_points: Number(result.floored_points ?? 0),
              decimal_remainder: Number(result.decimal_remainder ?? 0),
              remainder_bonus: Number(result.remainder_bonus ?? 0),
            }
          : {}),
    }),
  );

  return {
    round: {
      id: round.id,
      name: round.name,
      edition: editionName,
      total_points: round.total_points_to_distribute,
      calculated_at: round.calculated_at,
      version: round.calculation_version,
      engine_version: round.televote_engine_version ?? "rank-weighted-v1",
      advanced,
      broadcast_mode: round.broadcast_display_mode ?? "converted",
    },
    rows,
  };
}

export async function getMergedPublishedTelevotingResultsServer(
  roundId?: string,
): Promise<PublishedResultsPayload> {
  try {
    return await readPublishedResults(televotingPublicServer, roundId);
  } catch (publicError) {
    throw new Error(
      publicError instanceof Error
        ? `Published Televoting results are not publicly readable: ${publicError.message}`
        : "Published Televoting results are not publicly readable.",
    );
  }
}

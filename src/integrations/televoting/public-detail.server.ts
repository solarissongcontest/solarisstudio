import { supabase } from "@/integrations/supabase/client";

export type PublicShowTelevoteRoundDetail = {
  round: {
    id: string;
    name: string;
    sourceType: string;
    displayOrder: number;
    weightPercent?: number;
    hasSourceMatrix: boolean;
  };
  rows: Array<{
    country_code: string;
    final_points: number;
    raw_score?: number;
    activity_points?: number;
    country_contributions: Record<string, number>;
  }>;
};

export type PublicShowTelevoteDetail = {
  rounds: PublicShowTelevoteRoundDetail[];
} | null;

function sanitizeContributionMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const output: Record<string, number> = {};
  for (const [rawCode, rawPoints] of Object.entries(value as Record<string, unknown>)) {
    const code = rawCode.trim().toUpperCase();
    const points = Number(rawPoints);
    if (!/^[A-Z0-9_-]{2,12}$/.test(code)) continue;
    if (!Number.isFinite(points) || points <= 0 || points > 100000) continue;
    output[code] = points;
  }
  return output;
}

function optionalNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

/**
 * Read only the sanitized public snapshot. The snapshot owns the canonical
 * publication gate and deliberately exposes aggregate round/source data only.
 * Raw ballots, usernames, integrity metadata and internal calculation config
 * never cross this boundary.
 */
export async function getPublicShowTelevoteDetailServer(
  showId: string,
): Promise<PublicShowTelevoteDetail> {
  const db = supabase as any;
  const { data, error } = await db
    .from("public_televote_country_contributions")
    .select(
      "show_id,round_id,round_name,source_type,display_order,weight_percent,country_code,final_points,raw_score,activity_points,country_contributions",
    )
    .eq("show_id", showId)
    .order("display_order", { ascending: true })
    .order("round_name", { ascending: true })
    .order("final_points", { ascending: false });

  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  const grouped = new Map<string, PublicShowTelevoteRoundDetail>();

  for (const rawRow of data as Array<Record<string, unknown>>) {
    const roundId = String(rawRow.round_id ?? "").trim();
    const countryCode = String(rawRow.country_code ?? "").trim().toUpperCase();
    if (!roundId || !/^[A-Z0-9_-]{2,12}$/.test(countryCode)) continue;

    const contributions = sanitizeContributionMap(rawRow.country_contributions);
    const finalPoints = Number(rawRow.final_points ?? 0);
    const rawScore = optionalNumber(rawRow.raw_score);
    const activityPoints = optionalNumber(rawRow.activity_points);
    const displayOrder = Number(rawRow.display_order ?? 0);
    const weightPercent = optionalNumber(rawRow.weight_percent);

    let round = grouped.get(roundId);
    if (!round) {
      round = {
        round: {
          id: roundId,
          name: String(rawRow.round_name ?? "Televote"),
          sourceType: String(rawRow.source_type ?? "round"),
          displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
          ...(weightPercent != null ? { weightPercent } : {}),
          hasSourceMatrix: false,
        },
        rows: [],
      };
      grouped.set(roundId, round);
    }

    if (Object.keys(contributions).length > 0) {
      round.round.hasSourceMatrix = true;
    }

    round.rows.push({
      country_code: countryCode,
      final_points: Number.isFinite(finalPoints) ? finalPoints : 0,
      ...(rawScore != null ? { raw_score: rawScore } : {}),
      ...(activityPoints != null ? { activity_points: activityPoints } : {}),
      country_contributions: contributions,
    });
  }

  const rounds = [...grouped.values()]
    .map((round) => ({
      ...round,
      rows: [...round.rows].sort(
        (a, b) =>
          b.final_points - a.final_points ||
          (b.raw_score ?? -Infinity) - (a.raw_score ?? -Infinity) ||
          a.country_code.localeCompare(b.country_code),
      ),
    }))
    .filter((round) => round.rows.length > 0)
    .sort(
      (a, b) =>
        a.round.displayOrder - b.round.displayOrder ||
        a.round.name.localeCompare(b.round.name),
    );

  return rounds.length ? { rounds } : null;
}

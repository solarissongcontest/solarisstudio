import { supabase } from "@/integrations/supabase/client";

export type PublicShowTelevoteDetail = {
  round: {
    id: string;
    name: string;
    advanced: true;
  };
  rows: Array<{
    country_code: string;
    final_points: number;
    activity_points?: number;
    country_contributions: Record<string, number>;
  }>;
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

/**
 * Read only the sanitized public view. The view itself owns the canonical
 * publication/transparency gate and intentionally exposes no raw ballots,
 * usernames, integrity metadata or internal calculation config.
 */
export async function getPublicShowTelevoteDetailServer(
  showId: string,
): Promise<PublicShowTelevoteDetail> {
  const db = supabase as any;
  const { data, error } = await db
    .from("public_televote_country_contributions")
    .select(
      "show_id,round_id,round_name,country_code,final_points,activity_points,country_contributions",
    )
    .eq("show_id", showId)
    .order("final_points", { ascending: false });

  if (error) throw new Error(error.message);
  if (!data?.length) return null;

  const first = data[0];
  const rows = data
    .map((row: Record<string, unknown>) => {
      const countryCode = String(row.country_code ?? "").trim().toUpperCase();
      const contributions = sanitizeContributionMap(row.country_contributions);
      if (!countryCode || !Object.keys(contributions).length) return null;

      const finalPoints = Number(row.final_points ?? 0);
      const activityPoints = Number(row.activity_points ?? NaN);

      return {
        country_code: countryCode,
        final_points: Number.isFinite(finalPoints) ? finalPoints : 0,
        ...(Number.isFinite(activityPoints) && activityPoints >= 0
          ? { activity_points: activityPoints }
          : {}),
        country_contributions: contributions,
      };
    })
    .filter(
      (
        row: {
          country_code: string;
          final_points: number;
          activity_points?: number;
          country_contributions: Record<string, number>;
        } | null,
      ): row is {
        country_code: string;
        final_points: number;
        activity_points?: number;
        country_contributions: Record<string, number>;
      } => row !== null,
    );

  if (!rows.length) return null;

  return {
    round: {
      id: String(first.round_id ?? ""),
      name: String(first.round_name ?? "Televote"),
      advanced: true,
    },
    rows,
  };
}

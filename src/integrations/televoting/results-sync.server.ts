import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type SolarisResultSyncOutcome = {
  ok: boolean;
  status:
    | "synced"
    | "waiting_for_combined"
    | "unbound_show"
    | "source_not_published"
    | "lineup_mismatch";
  sourceType: "round" | "combined";
  sourceId: string;
  editionId?: string;
  showId?: string;
  imported?: number;
  message?: string;
};

type ImportRow = {
  countryCode: string;
  points: number;
};


function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value ?? "Unknown error");
}

function normaliseCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function publicCountryContributions(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output: Record<string, number> = {};

  for (const [rawCode, rawPoints] of Object.entries(value as Record<string, unknown>)) {
    const code = normaliseCode(rawCode);
    const points = Number(rawPoints);
    if (!/^[A-Z0-9_-]{2,12}$/.test(code)) continue;
    if (!Number.isFinite(points) || points <= 0 || points > 100000) continue;
    output[code] = points;
  }

  return Object.keys(output).length ? output : null;
}

function combinedSourceContributions(value: unknown) {
  if (!Array.isArray(value)) return [] as Array<Record<string, unknown>>;
  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

// The official Televote-to-Results mutation belongs in one governed database
// transaction. No application-side ranking or per-row public.results writes.
async function writeCanonicalShowTelevote(data: {
  editionId: string;
  showId: string;
  sourceType: "round" | "combined";
  sourceId: string;
  rows: ImportRow[];
}): Promise<SolarisResultSyncOutcome> {
  // The database RPC is explicitly service_role-only. Do not silently fall
  // back to an Organizer/RLS client and partially synchronize results.
  if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) {
    throw new Error("Server-only Supabase service-role access is required for canonical Televote synchronization");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: response, error } = await (supabaseAdmin as any).rpc(
    "v3_reconcile_published_televote",
    {
      p_source_type: data.sourceType,
      p_source_id: data.sourceId,
    },
  );
  if (error) throw new Error(`Atomic Televote reconciliation failed: ${error.message}`);
  if (!response || typeof response !== "object" || response.ok !== true) {
    throw new Error("Atomic Televote reconciliation did not return a successful receipt");
  }
  if (response.showId !== data.showId || response.editionId !== data.editionId) {
    throw new Error("Canonical Televote synchronization resolved a different show or edition");
  }
  const imported = Number(response.rowCount);
  if (!Number.isSafeInteger(imported) || imported < 1) {
    throw new Error("Canonical Televote reconciliation returned an invalid participant count");
  }
  return {
    ok: true,
    status: "synced",
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    editionId: response.editionId,
    showId: response.showId,
    imported,
    message: `${imported} Televoting results synchronized through canonical Solaris Results authority.`,
  };
}

export async function syncPublishedRoundResultsToSolarisServer(
  roundId: string,
): Promise<SolarisResultSyncOutcome> {
  await requireMergedTelevotingAdminServer();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: round, error: roundError } = await televotingAdmin
    .from("rounds")
    .select("id,name,results_status,results_outdated,broadcast_display_mode,calculation_version,public_advanced_transparency")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) throw new Error(roundError.message);
  if (!round || round.results_status !== "published" || round.results_outdated || Number(round.calculation_version) < 1) {
    return {
      ok: false,
      status: "source_not_published",
      sourceType: "round",
      sourceId: roundId,
      message: "The Televoting result is not published yet.",
    };
  }

  if (round.broadcast_display_mode === "combined") {
    return {
      ok: false,
      status: "waiting_for_combined",
      sourceType: "round",
      sourceId: roundId,
      message: "This round is part of a Combined Televote. Solaris will wait for the published Combined result.",
    };
  }

  const { data: binding, error: bindingError } = await db
    .from("televoting_round_bindings")
    .select("edition_id,show_id")
    .eq("remote_round_id", roundId)
    .maybeSingle();
  if (bindingError) throw new Error(bindingError.message);
  if (!binding?.show_id) {
    return {
      ok: false,
      status: "unbound_show",
      sourceType: "round",
      sourceId: roundId,
      editionId: binding?.edition_id,
      message: "Bind this Televoting round to a Solaris show before publishing it into the official scoreboard.",
    };
  }

  const { data: rows, error: resultError } = await televotingAdmin
    .from("round_results")
    .select("country_code,final_points,original_votes,calculation_version,calculation_config")
    .eq("round_id", roundId)
    .eq("calculation_version", Number(round.calculation_version ?? 0));
  if (resultError) throw new Error(resultError.message);

  const outcome = await writeCanonicalShowTelevote({
    editionId: binding.edition_id,
    showId: binding.show_id,
    sourceType: "round",
    sourceId: roundId,
    rows: (rows ?? []).map((row) => ({ countryCode: String(row.country_code ?? ""), points: Number(row.final_points ?? 0) })),
  });

  if (outcome.ok && round.public_advanced_transparency) {
    const snapshotRows = (rows ?? []).map((row) => {
      const config =
        row.calculation_config &&
        typeof row.calculation_config === "object" &&
        !Array.isArray(row.calculation_config)
          ? (row.calculation_config as Record<string, unknown>)
          : {};
      const contributions = publicCountryContributions(config.country_contributions) ?? {};
      const activityPoints = Number(config.activity_points ?? NaN);
      const rawScore = Number(row.original_votes ?? NaN);

      return {
        show_id: binding.show_id,
        round_id: roundId,
        round_name: round.name,
        source_type: "round",
        display_order: 0,
        weight_percent: null,
        country_code: normaliseCode(row.country_code),
        final_points: Math.trunc(Number(row.final_points ?? 0)),
        raw_score: Number.isFinite(rawScore) ? rawScore : null,
        activity_points:
          Number.isFinite(activityPoints) && activityPoints >= 0
            ? activityPoints
            : null,
        country_contributions: contributions,
        updated_at: new Date().toISOString(),
      };
    });

    try {
      const { error: clearError } = await db
        .from("public_televote_country_contributions")
        .delete()
        .eq("show_id", binding.show_id)
        .eq("round_id", roundId);
      if (clearError) throw clearError;

      if (snapshotRows.length) {
        const { error: snapshotError } = await db
          .from("public_televote_country_contributions")
          .insert(snapshotRows);
        if (snapshotError) throw snapshotError;
      }
    } catch (caught) {
      console.error(
        "[Televoting result sync] Could not refresh public aggregate snapshot",
        caught,
      );
    }
  }

  return outcome;
}

export async function syncPublishedCombinedResultsToSolarisServer(
  aggregationId: string,
): Promise<SolarisResultSyncOutcome> {
  await requireMergedTelevotingAdminServer();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: aggregation, error: aggregationError } = await televotingAdmin
    .from("televote_aggregations")
    .select("id,name,status,calculation_version,results_outdated")
    .eq("id", aggregationId)
    .maybeSingle();
  if (aggregationError) throw new Error(aggregationError.message);
  if (!aggregation || aggregation.status !== "published" || aggregation.results_outdated) {
    return {
      ok: false,
      status: "source_not_published",
      sourceType: "combined",
      sourceId: aggregationId,
      message: "The Combined Televote is not published and current yet.",
    };
  }

  const { data: sources, error: sourceError } = await televotingAdmin
    .from("televote_aggregation_sources")
    .select("id,source_type,source_round_id,source_name,enabled,display_order,percentage_weight")
    .eq("aggregation_id", aggregationId);
  if (sourceError) throw new Error(sourceError.message);
  const enabledSources = (sources ?? []).filter((source) => source.enabled);
  const sourceRoundIds = [...new Set(enabledSources
    .filter((source) => source.source_round_id)
    .map((source) => String(source.source_round_id)))];

  if (!sourceRoundIds.length) {
    return {
      ok: false,
      status: "unbound_show",
      sourceType: "combined",
      sourceId: aggregationId,
      message: "The Combined Televote has no linked voting round from which Solaris can resolve its show.",
    };
  }

  const { data: bindings, error: bindingError } = await db
    .from("televoting_round_bindings")
    .select("remote_round_id,edition_id,show_id")
    .in("remote_round_id", sourceRoundIds);
  if (bindingError) throw new Error(bindingError.message);
  const bound = (bindings ?? []).filter((binding: any) => binding.show_id);
  const targetKeys = [...new Set(bound.map((binding: any) => `${binding.edition_id}:${binding.show_id}`))];
  if (targetKeys.length !== 1 || bound.length !== sourceRoundIds.length) {
    return {
      ok: false,
      status: "unbound_show",
      sourceType: "combined",
      sourceId: aggregationId,
      message: "Every enabled Combined source round must be bound to the same Solaris show.",
    };
  }
  const target = bound[0];

  const { data: rows, error: resultError } = await televotingAdmin
    .from("combined_televote_results")
    .select("country_code,final_combined_points,calculation_version,source_contributions")
    .eq("aggregation_id", aggregationId)
    .eq("calculation_version", Number(aggregation.calculation_version ?? 0));
  if (resultError) throw new Error(resultError.message);

  const outcome = await writeCanonicalShowTelevote({
    editionId: target.edition_id,
    showId: target.show_id,
    sourceType: "combined",
    sourceId: aggregationId,
    rows: (rows ?? []).map((row) => ({
      countryCode: String(row.country_code ?? ""),
      points: Number(row.final_combined_points ?? 0),
    })),
  });

  if (outcome.ok) {
    const contributionByRoundCountry = new Map<string, Record<string, number>>();
    if (sourceRoundIds.length) {
      const { data: roundRows, error: roundRowsError } = await televotingAdmin
        .from("round_results")
        .select("round_id,country_code,calculation_config")
        .in("round_id", sourceRoundIds);
      if (roundRowsError) throw new Error(roundRowsError.message);

      for (const row of roundRows ?? []) {
        const config =
          row.calculation_config &&
          typeof row.calculation_config === "object" &&
          !Array.isArray(row.calculation_config)
            ? (row.calculation_config as Record<string, unknown>)
            : {};
        const contributions = publicCountryContributions(config.country_contributions);
        if (!contributions) continue;
        contributionByRoundCountry.set(
          `${String(row.round_id)}:${normaliseCode(row.country_code)}`,
          contributions,
        );
      }
    }

    const sourceById = new Map(
      enabledSources.map((source) => [String(source.id), source]),
    );
    const snapshotRows: Array<Record<string, unknown>> = [];

    for (const row of rows ?? []) {
      const countryCode = normaliseCode(row.country_code);
      for (const item of combinedSourceContributions(row.source_contributions)) {
        const sourceId = String(item.source_id ?? "");
        const source = sourceById.get(sourceId);
        if (!source) continue;

        const rawScore = Number(item.raw_score ?? NaN);
        const allocatedPoints = Number(item.allocated_points ?? NaN);
        const weightPercent = Number(source.percentage_weight ?? NaN);
        const sourceRoundId = source.source_round_id
          ? String(source.source_round_id)
          : `aggregation-source:${sourceId}`;
        const contributions = source.source_round_id
          ? contributionByRoundCountry.get(
              `${String(source.source_round_id)}:${countryCode}`,
            ) ?? {}
          : {};

        snapshotRows.push({
          show_id: target.show_id,
          round_id: sourceRoundId,
          round_name: String(source.source_name ?? "Televote source"),
          source_type: String(source.source_type ?? "other"),
          display_order: Number(source.display_order ?? 0),
          weight_percent: Number.isFinite(weightPercent) ? weightPercent : null,
          country_code: countryCode,
          final_points: Number.isFinite(allocatedPoints)
            ? Math.trunc(allocatedPoints)
            : 0,
          raw_score: Number.isFinite(rawScore) ? rawScore : null,
          activity_points:
            String(source.source_type ?? "") === "activity" &&
            Number.isFinite(rawScore)
              ? rawScore
              : null,
          country_contributions: contributions,
          updated_at: new Date().toISOString(),
        });
      }
    }

    try {
      const { error: clearError } = await db
        .from("public_televote_country_contributions")
        .delete()
        .eq("show_id", target.show_id)
        .neq("source_type", "live");
      if (clearError) throw clearError;

      if (snapshotRows.length) {
        const { error: snapshotError } = await db
          .from("public_televote_country_contributions")
          .insert(snapshotRows);
        if (snapshotError) throw snapshotError;
      }
    } catch (caught) {
      console.error(
        "[Televoting result sync] Could not refresh Combined Televote public snapshot",
        caught,
      );
    }
  }

  return outcome;
}

export async function trySyncPublishedRoundResultsToSolarisServer(roundId: string) {
  try {
    return await syncPublishedRoundResultsToSolarisServer(roundId);
  } catch (caught) {
    return {
      ok: false,
      status: "lineup_mismatch" as const,
      sourceType: "round" as const,
      sourceId: roundId,
      message: errorMessage(caught),
    };
  }
}

export async function trySyncPublishedCombinedResultsToSolarisServer(aggregationId: string) {
  try {
    return await syncPublishedCombinedResultsToSolarisServer(aggregationId);
  } catch (caught) {
    return {
      ok: false,
      status: "lineup_mismatch" as const,
      sourceType: "combined" as const,
      sourceId: aggregationId,
      message: errorMessage(caught),
    };
  }
}

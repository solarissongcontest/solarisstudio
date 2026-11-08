import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import { assertCombinedPublicationContextServer } from "@/integrations/televoting/combined-context.server";
import {
  assessCombinedPublicationRecovery,
  type CombinedRecoverySnapshotRow,
} from "@/integrations/televoting/combined-recovery";

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
  snapshotStatus?: "not_required" | "complete" | "incomplete";
};

type ImportRow = {
  countryCode: string;
  points: number;
};

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value ?? "Unknown error");
}

function normaliseCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
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

function buildCombinedSnapshotRows(
  rows: readonly Record<string, any>[],
  enabledSources: readonly Record<string, any>[],
  roundRows: readonly Record<string, any>[],
): CombinedRecoverySnapshotRow[] {
  const contributionByRoundCountry = new Map<string, Record<string, number>>();
  for (const row of roundRows) {
    const config =
      row.calculation_config &&
      typeof row.calculation_config === "object" &&
      !Array.isArray(row.calculation_config)
        ? (row.calculation_config as Record<string, unknown>)
        : {};
    const contributions = publicCountryContributions(config.country_contributions);
    if (contributions) {
      contributionByRoundCountry.set(
        `${String(row.round_id)}:${normaliseCode(row.country_code)}`,
        contributions,
      );
    }
  }

  const sourceById = new Map(enabledSources.map((source) => [String(source.id), source]));
  const snapshotRows: CombinedRecoverySnapshotRow[] = [];
  for (const row of rows) {
    const countryCode = normaliseCode(row.country_code);
    for (const item of combinedSourceContributions(row.source_contributions)) {
      const source = sourceById.get(String(item.source_id ?? ""));
      if (!source) continue;

      const sourceRoundId = source.source_round_id
        ? String(source.source_round_id)
        : `aggregation-source:${String(source.id)}`;
      const rawScore = Number(item.raw_score ?? NaN);
      const allocatedPoints = Number(item.allocated_points ?? NaN);
      const weightPercent = Number(source.percentage_weight ?? NaN);
      snapshotRows.push({
        roundId: sourceRoundId,
        countryCode,
        sourceType: String(source.source_type ?? "other"),
        displayOrder: Number(source.display_order ?? 0),
        finalPoints: Number.isFinite(allocatedPoints) ? Math.trunc(allocatedPoints) : 0,
        rawScore: Number.isFinite(rawScore) ? rawScore : null,
        activityPoints:
          String(source.source_type ?? "") === "activity" && Number.isFinite(rawScore)
            ? rawScore
            : null,
        weightPercent: Number.isFinite(weightPercent) ? weightPercent : null,
        countryContributions: source.source_round_id
          ? (contributionByRoundCountry.get(`${String(source.source_round_id)}:${countryCode}`) ??
            {})
          : {},
      });
    }
  }
  return snapshotRows;
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
    throw new Error(
      "Server-only Supabase service-role access is required for canonical Televote synchronization",
    );
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
    .select(
      "id,name,results_status,results_outdated,broadcast_display_mode,calculation_version,public_advanced_transparency",
    )
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) throw new Error(roundError.message);
  if (
    !round ||
    round.results_status !== "published" ||
    round.results_outdated ||
    Number(round.calculation_version) < 1
  ) {
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
      message:
        "This round is part of a Combined Televote. Solaris will wait for the published Combined result.",
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
      message:
        "Bind this Televoting round to a Solaris show before publishing it into the official scoreboard.",
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
    rows: (rows ?? []).map((row) => ({
      countryCode: String(row.country_code ?? ""),
      points: Number(row.final_points ?? 0),
    })),
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
          Number.isFinite(activityPoints) && activityPoints >= 0 ? activityPoints : null,
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
      console.error("[Televoting result sync] Could not refresh public aggregate snapshot", caught);
    }
  }

  return outcome;
}

export async function syncPublishedCombinedResultsToSolarisServer(
  aggregationId: string,
  expectedContext?: { editionId?: string; showId?: string },
): Promise<SolarisResultSyncOutcome> {
  await requireMergedTelevotingAdminServer();
  await assertCombinedPublicationContextServer({
    aggregationId,
    expectedEditionId: expectedContext?.editionId,
    expectedShowId: expectedContext?.showId,
  });
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
  const sourceRoundIds = [
    ...new Set(
      enabledSources
        .filter((source) => source.source_round_id)
        .map((source) => String(source.source_round_id)),
    ),
  ];

  if (!sourceRoundIds.length) {
    return {
      ok: false,
      status: "unbound_show",
      sourceType: "combined",
      sourceId: aggregationId,
      message:
        "The Combined Televote has no linked voting round from which Solaris can resolve its show.",
    };
  }

  const { data: bindings, error: bindingError } = await db
    .from("televoting_round_bindings")
    .select("remote_round_id,edition_id,show_id")
    .in("remote_round_id", sourceRoundIds);
  if (bindingError) throw new Error(bindingError.message);
  const bound = (bindings ?? []).filter((binding: any) => binding.show_id);
  const targetKeys = [
    ...new Set(bound.map((binding: any) => `${binding.edition_id}:${binding.show_id}`)),
  ];
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

  let snapshotStatus: SolarisResultSyncOutcome["snapshotStatus"] = "not_required";
  if (outcome.ok) {
    try {
      let roundRows: Record<string, any>[] = [];
      if (sourceRoundIds.length) {
        const { data, error: roundRowsError } = await televotingAdmin
          .from("round_results")
          .select("round_id,country_code,calculation_config")
          .in("round_id", sourceRoundIds);
        if (roundRowsError) throw new Error(roundRowsError.message);
        roundRows = data ?? [];
      }
      const snapshotRows = buildCombinedSnapshotRows(rows ?? [], enabledSources, roundRows);
      const { error: clearError } = await db
        .from("public_televote_country_contributions")
        .delete()
        .eq("show_id", target.show_id)
        .neq("source_type", "live");
      if (clearError) throw clearError;

      if (snapshotRows.length) {
        const { error: snapshotError } = await db.from("public_televote_country_contributions").insert(
          snapshotRows.map((row) => ({
            show_id: target.show_id,
            round_id: row.roundId,
            round_name:
              enabledSources.find((source) => String(source.source_round_id ?? `aggregation-source:${source.id}`) === row.roundId)
                ?.source_name ?? "Televote source",
            source_type: row.sourceType,
            display_order: row.displayOrder,
            weight_percent: row.weightPercent,
            country_code: row.countryCode,
            final_points: row.finalPoints,
            raw_score: row.rawScore,
            activity_points: row.activityPoints,
            country_contributions: row.countryContributions,
            updated_at: new Date().toISOString(),
          })),
        );
        if (snapshotError) throw snapshotError;
      }
      snapshotStatus = "complete";
    } catch (caught) {
      console.error(
        "[Televoting result sync] Could not refresh Combined Televote public snapshot",
        caught,
      );
      snapshotStatus = "incomplete";
    }
  }

  return { ...outcome, snapshotStatus };
}

export async function getPublishedCombinedRecoveryServer(
  aggregationId: string,
  expectedContext?: { editionId?: string; showId?: string },
) {
  await requireMergedTelevotingAdminServer();
  const target = await assertCombinedPublicationContextServer({
    aggregationId,
    expectedEditionId: expectedContext?.editionId,
    expectedShowId: expectedContext?.showId,
  });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: aggregation, error: aggregationError } = await televotingAdmin
    .from("televote_aggregations")
    .select("id,status,calculation_version,results_outdated")
    .eq("id", aggregationId)
    .maybeSingle();
  if (aggregationError) throw new Error(aggregationError.message);
  if (!aggregation) throw new Error("Combined result not found");

  const { data: sourceRows, error: sourceError } = await televotingAdmin
    .from("combined_televote_results")
    .select("country_code,final_combined_points,source_contributions")
    .eq("aggregation_id", aggregationId)
    .eq("calculation_version", Number(aggregation.calculation_version ?? 0));
  if (sourceError) throw new Error(sourceError.message);

  const sourceProjection = (sourceRows ?? []).map((row: any) => ({
    countryCode: normaliseCode(row.country_code),
    points: Number(row.final_combined_points ?? 0),
  }));
  const { data: projectionRows, error: projectionError } = await db
    .from("televote_votes")
    .select("country_id,points")
    .eq("show_id", target.showId);
  if (projectionError) throw new Error(projectionError.message);
  const countryIds = [
    ...new Set((projectionRows ?? []).map((row: any) => String(row.country_id ?? ""))),
  ].filter(Boolean);
  const { data: countries, error: countryError } = countryIds.length
    ? await db.from("countries").select("id,short_code").in("id", countryIds)
    : { data: [], error: null };
  if (countryError) throw new Error(countryError.message);
  const countryCodeById = new Map(
    (countries ?? []).map((country: any) => [
      String(country.id),
      normaliseCode(country.short_code),
    ]),
  );
  const canonicalProjection = (projectionRows ?? [])
    .map((row: any) => ({
      countryCode: countryCodeById.get(String(row.country_id)) ?? "",
      points: Number(row.points ?? 0),
    }))
  const { data: snapshotRows, error: snapshotError } = await db
    .from("public_televote_country_contributions")
    .select(
      "round_id,country_code,source_type,display_order,final_points,raw_score,activity_points,weight_percent,country_contributions",
    )
    .eq("show_id", target.showId)
    .neq("source_type", "live");
  const { data: sources, error: sourcesError } = await televotingAdmin
    .from("televote_aggregation_sources")
    .select("id,source_type,source_round_id,source_name,display_order,percentage_weight,enabled")
    .eq("aggregation_id", aggregationId);
  if (sourcesError) throw new Error(sourcesError.message);
  const enabledSources = (sources ?? []).filter((source: any) => source.enabled);
  const sourceRoundIds = [
    ...new Set(
      enabledSources
        .filter((source: any) => source.source_round_id)
        .map((source: any) => String(source.source_round_id)),
    ),
  ];
  const { data: roundRows, error: roundRowsError } = sourceRoundIds.length
    ? await televotingAdmin
        .from("round_results")
        .select("round_id,country_code,calculation_config")
        .in("round_id", sourceRoundIds)
    : { data: [], error: null };
  if (roundRowsError) throw new Error(roundRowsError.message);
  const expectedSnapshotRows = buildCombinedSnapshotRows(
    sourceRows ?? [],
    enabledSources,
    roundRows ?? [],
  );
  const actualSnapshotRows = (snapshotRows ?? []).map((row: any) => ({
    roundId: String(row.round_id ?? ""),
    countryCode: normaliseCode(row.country_code),
    sourceType: String(row.source_type ?? ""),
    displayOrder: Number(row.display_order ?? 0),
    finalPoints: Number(row.final_points),
    rawScore: row.raw_score == null ? null : Number(row.raw_score),
    activityPoints: row.activity_points == null ? null : Number(row.activity_points),
    weightPercent: row.weight_percent == null ? null : Number(row.weight_percent),
    countryContributions: row.country_contributions ?? {},
  }));

  return {
    aggregationId,
    editionId: target.editionId,
    showId: target.showId,
    ...assessCombinedPublicationRecovery({
      published: aggregation.status === "published" && !aggregation.results_outdated,
      sourceRows: sourceProjection,
      projectionRows: canonicalProjection,
      snapshot: {
        expectedRows: expectedSnapshotRows,
        actualRows: actualSnapshotRows,
        readable: !snapshotError,
      },
    }),
  };
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

export async function trySyncPublishedCombinedResultsToSolarisServer(
  aggregationId: string,
  expectedContext?: { editionId?: string; showId?: string },
) {
  try {
    return await syncPublishedCombinedResultsToSolarisServer(aggregationId, expectedContext);
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

import { requireSolarisCapabilityServer } from "@/integrations/supabase/capabilities.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type JuryIntegrityTargetEvidence = {
  targetCountryId: string;
  targetName: string;
  score: number;
  expectedNormalizedScore: number;
  positiveDeviation: number;
  zScore: number;
  risk: number;
};

export type JuryIntegrityCase = {
  id: string;
  editionId: string;
  showId: string;
  showName: string;
  editionLabel: string;
  countryCode: string;
  hodPersonId: string | null;
  risk: number;
  relationshipRisk: number;
  confidence: number;
  independenceScore: number;
  peerDeviationRisk: number;
  peerBallots: number;
  evidenceFamilies: string[];
  interventionLevel: string;
  attestedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  targets: JuryIntegrityTargetEvidence[];
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function listJuryIntegrityCasesServer(editionId: string) {
  const scopedEditionId = String(editionId ?? "").trim();
  if (!scopedEditionId) throw new Error("Jury Integrity requires an explicit edition scope");
  await requireSolarisCapabilityServer("integrity.read", scopedEditionId);

  const db = supabaseAdmin as any;
  const tv = db.schema("televoting");

  const { data: rows, error } = await tv
    .from("vote_preflight_checks")
    .select("id,show_id,canonical_edition_id,country_code,hod_person_id,relationship_risk,risk_score,confidence,intervention_level,model_version,admin_evidence,attested_at,submitted_at,created_at")
    .eq("canonical_edition_id", scopedEditionId)
    .not("show_id", "is", null)
    .eq("model_version", "jury-integrity-model-v5")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const preflights = rows ?? [];
  const mismatchedPreflight = preflights.find(
    (row: any) => String(row.canonical_edition_id ?? "") !== scopedEditionId,
  );
  if (mismatchedPreflight) {
    throw new Error("Jury Integrity returned evidence outside the selected edition scope");
  }

  const showIds = [...new Set(preflights.map((row: any) => String(row.show_id ?? "")).filter(Boolean))];

  const [showsResult, editionResult] = await Promise.all([
    showIds.length
      ? db.from("shows").select("id,name,edition_id").eq("edition_id", scopedEditionId).in("id", showIds)
      : Promise.resolve({ data: [], error: null }),
    db.from("editions").select("id,name,edition_number").eq("id", scopedEditionId).maybeSingle(),
  ]);
  if (showsResult.error) throw new Error(showsResult.error.message);
  if (editionResult.error) throw new Error(editionResult.error.message);
  if (!editionResult.data) throw new Error("Jury Integrity edition could not be resolved");

  const returnedShowIds = new Set(
    (showsResult.data ?? []).map((row: any) => String(row.id ?? "")).filter(Boolean),
  );
  const missingShow = showIds.find((showId) => !returnedShowIds.has(showId));
  if (missingShow) {
    throw new Error("Jury Integrity evidence references a show outside the selected edition scope");
  }

  const shows = new Map<string, string>(
    (showsResult.data ?? []).map((row: any): [string, string] => [
      String(row.id),
      String(row.name ?? "Jury show"),
    ]),
  );
  const editionLabel = editionResult.data.edition_number
    ? `SSC ${Number(editionResult.data.edition_number)} · ${String(editionResult.data.name ?? "Edition")}`
    : String(editionResult.data.name ?? "Edition");

  const targetIds = new Set<string>();
  for (const row of preflights) {
    const evidence = asObject(asObject(row.admin_evidence).juryIndependence);
    for (const target of asArray(evidence.targets)) {
      const id = String(asObject(target).targetCountryId ?? "");
      if (id) targetIds.add(id);
    }
  }
  const countriesResult = targetIds.size
    ? await db.from("countries").select("id,name,short_code").in("id", [...targetIds])
    : { data: [], error: null };
  if (countriesResult.error) throw new Error(countriesResult.error.message);
  const countryNames = new Map<string, string>(
    (countriesResult.data ?? []).map((row: any): [string, string] => [
      String(row.id),
      String(row.name ?? row.short_code ?? row.id),
    ]),
  );

  const cases: JuryIntegrityCase[] = preflights.map((row: any) => {
    const evidence = asObject(asObject(row.admin_evidence).juryIndependence);
    const targets = asArray(evidence.targets).map((target): JuryIntegrityTargetEvidence => {
      const item = asObject(target);
      const targetCountryId = String(item.targetCountryId ?? "");
      return {
        targetCountryId,
        targetName: countryNames.get(targetCountryId) ?? targetCountryId,
        score: numberValue(item.score),
        expectedNormalizedScore: numberValue(item.expectedNormalizedScore),
        positiveDeviation: numberValue(item.positiveDeviation),
        zScore: numberValue(item.zScore),
        risk: numberValue(item.risk),
      };
    });
    return {
      id: String(row.id),
      editionId: scopedEditionId,
      showId: String(row.show_id ?? ""),
      showName: shows.get(String(row.show_id ?? "")) ?? "Jury show",
      editionLabel,
      countryCode: String(row.country_code ?? ""),
      hodPersonId: row.hod_person_id ? String(row.hod_person_id) : null,
      risk: numberValue(row.risk_score),
      relationshipRisk: numberValue(row.relationship_risk),
      confidence: numberValue(row.confidence),
      independenceScore: numberValue(evidence.independenceScore),
      peerDeviationRisk: numberValue(evidence.peerDeviationRisk),
      peerBallots: numberValue(evidence.peerBallots),
      evidenceFamilies: asArray(evidence.evidenceFamilies).map(String),
      interventionLevel: String(row.intervention_level ?? "none"),
      attestedAt: row.attested_at ? String(row.attested_at) : null,
      submittedAt: row.submitted_at ? String(row.submitted_at) : null,
      createdAt: String(row.created_at),
      targets,
    };
  });

  return {
    editionId: scopedEditionId,
    cases,
    stats: {
      total: cases.length,
      reviewOrHigher: cases.filter((row) => row.risk >= 50).length,
      declarationOrHigher: cases.filter((row) => row.risk >= 65).length,
      highOrHigher: cases.filter((row) => row.risk >= 80).length,
    },
  };
}

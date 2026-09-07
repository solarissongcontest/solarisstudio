import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import type {
  VoteIntegrityFinding,
  VoteIntegrityTechnicalSignal,
} from "@/integrations/televoting/integrity";

export type IntegrityJsonValue =
  | string
  | number
  | boolean
  | null
  | IntegrityJsonValue[]
  | { [key: string]: IntegrityJsonValue };

export type IntegrityDeclarationRow = {
  id: string;
  round_id: string;
  round_name: string;
  edition_name: string | null;
  username: string;
  country_code: string;
  hod_person_id: string | null;
  relationship_risk: number;
  risk_score: number;
  confidence: number;
  severity: string;
  intervention_level: string;
  model_version: string;
  voter_reason_categories: string[];
  admin_evidence: { [key: string]: IntegrityJsonValue };
  findings: VoteIntegrityFinding[];
  technical_signals: VoteIntegrityTechnicalSignal[];
  history_summary: {
    hodHistoryAvailable?: boolean;
    televoteBallotsConsidered?: number;
    juryBallotsConsidered?: number;
    previousIpFingerprints?: number;
    ipChanged?: boolean;
  };
  statement_version: number;
  attested_at: string | null;
  signed_name: string | null;
  attestation_text: string | null;
  submission_id: string | null;
  submission_status: string | null;
  submitted_at: string | null;
  expires_at: string;
  created_at: string;
};

type PreflightDbRow = {
  id: string;
  round_id: string;
  username_normalized: string;
  country_code: string;
  hod_person_id: string | null;
  relationship_risk: number;
  risk_score: number;
  confidence: number;
  severity: string;
  intervention_level: string;
  model_version: string;
  voter_reason_categories: unknown;
  admin_evidence: unknown;
  findings: unknown;
  technical_signals: unknown;
  history_summary: unknown;
  statement_version: number;
  attested_at: string | null;
  signed_name: string | null;
  attestation_text: string | null;
  submission_id: string | null;
  submitted_at: string | null;
  expires_at: string;
  created_at: string;
};

type RoundDbRow = { id: string; name: string | null; edition_id: string | null };
type SubmissionDbRow = { id: string; status: string | null };
type EditionDbRow = { id: string; name: string | null; edition_number: number | null };
type RoundMeta = { name: string; editionId: string };

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asJsonValue(value: unknown): IntegrityJsonValue {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(asJsonValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, asJsonValue(item)]),
    );
  }
  return String(value);
}

function asJsonObject(value: unknown): { [key: string]: IntegrityJsonValue } {
  const json = asJsonValue(value);
  return json && typeof json === "object" && !Array.isArray(json) ? json : {};
}

export async function listIntegrityDeclarationsServer(input?: {
  limit?: number;
  signedOnly?: boolean;
}) {
  await requireMergedTelevotingAdminServer();

  const limit = Math.max(1, Math.min(1000, Number(input?.limit ?? 300)));
  const tv = (supabaseAdmin as any).schema("televoting");

  let query = tv
    .from("vote_preflight_checks")
    .select(
      "id,round_id,username_normalized,country_code,hod_person_id,relationship_risk,risk_score,confidence,severity,intervention_level,model_version,voter_reason_categories,admin_evidence,findings,technical_signals,history_summary,statement_version,attested_at,signed_name,attestation_text,submission_id,submitted_at,expires_at,created_at",
    )
    .eq("requires_attestation", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input?.signedOnly) query = query.not("attested_at", "is", null);

  const { data: preflights, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (preflights ?? []) as PreflightDbRow[];
  const roundIds = [...new Set(rows.map((row) => row.round_id).filter(Boolean))];
  const submissionIds = [...new Set(rows.map((row) => row.submission_id).filter((value): value is string => Boolean(value)))];

  const [roundsResult, submissionsResult] = await Promise.all([
    roundIds.length
      ? tv.from("rounds").select("id,name,edition_id").in("id", roundIds)
      : Promise.resolve({ data: [] as RoundDbRow[], error: null }),
    submissionIds.length
      ? tv.from("vote_submissions").select("id,status").in("id", submissionIds)
      : Promise.resolve({ data: [] as SubmissionDbRow[], error: null }),
  ]);
  if (roundsResult.error) throw new Error(roundsResult.error.message);
  if (submissionsResult.error) throw new Error(submissionsResult.error.message);

  const roundRows = (roundsResult.data ?? []) as RoundDbRow[];
  const submissionRows = (submissionsResult.data ?? []) as SubmissionDbRow[];
  const rounds = new Map<string, RoundMeta>(
    roundRows.map((round) => [
      String(round.id),
      { name: String(round.name ?? "Voting round"), editionId: String(round.edition_id ?? "") },
    ]),
  );
  const submissionStatus = new Map<string, string>(
    submissionRows.map((submission) => [String(submission.id), String(submission.status ?? "")]),
  );

  const editionIds = [...new Set([...rounds.values()].map((round) => round.editionId).filter(Boolean))];
  const editionsResult = editionIds.length
    ? await tv.from("editions").select("id,name,edition_number").in("id", editionIds)
    : { data: [] as EditionDbRow[], error: null };
  if (editionsResult.error) throw new Error(editionsResult.error.message);

  const editionRows = (editionsResult.data ?? []) as EditionDbRow[];
  const editionNames = new Map<string, string>(
    editionRows.map((edition) => [
      String(edition.id),
      edition.edition_number
        ? `SSC ${edition.edition_number} · ${String(edition.name ?? "Edition")}`
        : String(edition.name ?? "Edition"),
    ]),
  );

  return rows.map((row): IntegrityDeclarationRow => {
    const round = rounds.get(row.round_id);
    const history = asObject(row.history_summary);
    return {
      id: row.id,
      round_id: row.round_id,
      round_name: round?.name ?? "Voting round",
      edition_name: round?.editionId ? editionNames.get(round.editionId) ?? null : null,
      username: row.username_normalized,
      country_code: row.country_code,
      hod_person_id: row.hod_person_id,
      relationship_risk: Number(row.relationship_risk ?? 0),
      risk_score: Number(row.risk_score ?? 0),
      confidence: Number(row.confidence ?? 0),
      severity: row.severity,
      intervention_level: String(row.intervention_level ?? "none"),
      model_version: String(row.model_version ?? "friend-voting-model-v3"),
      voter_reason_categories: asArray<string>(row.voter_reason_categories),
      admin_evidence: asJsonObject(row.admin_evidence),
      findings: asArray<VoteIntegrityFinding>(row.findings),
      technical_signals: asArray<VoteIntegrityTechnicalSignal>(row.technical_signals),
      history_summary: {
        hodHistoryAvailable: Boolean(history.hodHistoryAvailable),
        televoteBallotsConsidered: Number(history.televoteBallotsConsidered ?? 0),
        juryBallotsConsidered: Number(history.juryBallotsConsidered ?? 0),
        previousIpFingerprints: Number(history.previousIpFingerprints ?? 0),
        ipChanged: Boolean(history.ipChanged),
      },
      statement_version: Number(row.statement_version ?? 1),
      attested_at: row.attested_at,
      signed_name: row.signed_name,
      attestation_text: row.attestation_text,
      submission_id: row.submission_id,
      submission_status: row.submission_id ? submissionStatus.get(row.submission_id) ?? null : null,
      submitted_at: row.submitted_at,
      expires_at: row.expires_at,
      created_at: row.created_at,
    };
  });
}

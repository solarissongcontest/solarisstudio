import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { listIntegrityDeclarationsServer, type IntegrityDeclarationRow } from "@/integrations/televoting/integrity-declarations.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type IntegrityHumanDecision = "cleared" | "monitor" | "false_declaration_confirmed" | "ballot_excluded";
export type IntegritySanctionType = "temporary" | "permanent";

export type IntegrityDecisionRow = {
  id: string;
  preflight_id: string;
  submission_id: string | null;
  decision: IntegrityHumanDecision;
  reason: string;
  evidence_notes: string | null;
  organizer_id: string | null;
  ballot_excluded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegritySanctionRow = {
  id: string;
  preflight_id: string | null;
  source_decision_id: string | null;
  scope_type: "hod" | "country" | "username";
  hod_person_id: string | null;
  country_code: string | null;
  username_normalized: string | null;
  sanction_type: IntegritySanctionType;
  active_from: string;
  expires_at: string | null;
  reason: string;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  revocation_reason: string | null;
};

export type IntegrityAuditRow = {
  id: string;
  preflight_id: string | null;
  decision_id: string | null;
  sanction_id: string | null;
  submission_id: string | null;
  action: string;
  organizer_id: string | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type IntegrityModerationCase = IntegrityDeclarationRow & {
  human_decision: IntegrityDecisionRow | null;
  sanctions: IntegritySanctionRow[];
};

function ensureReason(value: string, minimum = 5) {
  const reason = String(value ?? "").trim();
  if (reason.length < minimum) throw new Error("Explain the organizer decision before saving it.");
  return reason;
}

export async function loadIntegrityModerationServer() {
  await requireMergedTelevotingAdminServer();
  const declarations = await listIntegrityDeclarationsServer({ limit: 750, signedOnly: false });
  const tv = (supabaseAdmin as any).schema("televoting");

  const [decisionsResult, sanctionsResult, auditResult] = await Promise.all([
    tv.from("vote_integrity_decisions").select("*").order("updated_at", { ascending: false }).limit(1000),
    tv.from("voter_sanctions").select("*").order("created_at", { ascending: false }).limit(1000),
    tv.from("integrity_action_audit").select("*").order("created_at", { ascending: false }).limit(500),
  ]);
  if (decisionsResult.error) throw new Error(decisionsResult.error.message);
  if (sanctionsResult.error) throw new Error(sanctionsResult.error.message);
  if (auditResult.error) throw new Error(auditResult.error.message);

  const decisions = (decisionsResult.data ?? []) as IntegrityDecisionRow[];
  const sanctions = (sanctionsResult.data ?? []) as IntegritySanctionRow[];
  const audit = (auditResult.data ?? []) as IntegrityAuditRow[];
  const decisionByPreflight = new Map(decisions.map((row) => [row.preflight_id, row]));
  const sanctionsByPreflight = new Map<string, IntegritySanctionRow[]>();
  for (const sanction of sanctions) {
    if (!sanction.preflight_id) continue;
    const current = sanctionsByPreflight.get(sanction.preflight_id) ?? [];
    current.push(sanction);
    sanctionsByPreflight.set(sanction.preflight_id, current);
  }

  const cases: IntegrityModerationCase[] = declarations.map((declaration) => ({
    ...declaration,
    human_decision: decisionByPreflight.get(declaration.id) ?? null,
    sanctions: sanctionsByPreflight.get(declaration.id) ?? [],
  }));

  const now = Date.now();
  const activeSanctions = sanctions.filter((sanction) =>
    !sanction.revoked_at &&
    new Date(sanction.active_from).getTime() <= now &&
    (!sanction.expires_at || new Date(sanction.expires_at).getTime() > now),
  );

  return { cases, sanctions, activeSanctions, audit };
}

export async function recordIntegrityDecisionServer(input: {
  preflightId: string;
  decision: IntegrityHumanDecision;
  reason: string;
  evidenceNotes?: string | null;
}) {
  await requireMergedTelevotingAdminServer();
  const reason = ensureReason(input.reason);
  const { data, error } = await (televotingAdmin as any).rpc("organizer_record_integrity_decision", {
    p_preflight_id: input.preflightId,
    p_decision: input.decision,
    p_reason: reason,
    p_evidence_notes: String(input.evidenceNotes ?? "").trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; decision: IntegrityHumanDecision; submission_id: string | null };
}

export async function excludeIntegrityBallotServer(input: { preflightId: string; reason: string }) {
  await requireMergedTelevotingAdminServer();
  const reason = ensureReason(input.reason);
  const { data, error } = await (televotingAdmin as any).rpc("organizer_exclude_integrity_ballot", {
    p_preflight_id: input.preflightId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as { submission_id: string; decision: IntegrityHumanDecision; ballot_excluded_at: string; preserved: true };
}

export async function createIntegritySanctionServer(input: {
  preflightId: string;
  sanctionType: IntegritySanctionType;
  expiresAt?: string | null;
  reason: string;
}) {
  await requireMergedTelevotingAdminServer();
  const reason = ensureReason(input.reason, 8);
  const expiresAt = input.sanctionType === "temporary" ? String(input.expiresAt ?? "") : null;
  if (input.sanctionType === "temporary") {
    const timestamp = new Date(expiresAt || "").getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) throw new Error("Choose a future end time for the temporary suspension.");
  }
  const { data, error } = await (televotingAdmin as any).rpc("organizer_create_integrity_sanction", {
    p_preflight_id: input.preflightId,
    p_sanction_type: input.sanctionType,
    p_expires_at: expiresAt || null,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; scope_type: string; sanction_type: IntegritySanctionType; expires_at: string | null };
}

export async function revokeIntegritySanctionServer(input: { sanctionId: string; reason: string }) {
  await requireMergedTelevotingAdminServer();
  const reason = ensureReason(input.reason);
  const { data, error } = await (televotingAdmin as any).rpc("organizer_revoke_integrity_sanction", {
    p_sanction_id: input.sanctionId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; revoked_at: string; ballot_restored: false };
}

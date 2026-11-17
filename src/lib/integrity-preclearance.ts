import { supabase } from "@/integrations/supabase/client";
import { governedIntegrityArgs } from "@/lib/v3-integrity-governed-operation";

export type PreclearanceOutcome =
  | "allowed"
  | "not_allowed"
  | "needs_more_information"
  | "guidance_only";

export type IntegrityPreclearanceRuling = {
  id: string;
  outcome: PreclearanceOutcome;
  summary: string;
  rationale: string;
  rule_ids: string[];
  created_at: string;
};

export type RecordPreclearanceRulingInput = {
  outcome: PreclearanceOutcome;
  summary: string;
  rationale: string;
  ruleIds: string[];
};

export type InterpretationDraftFromRulingInput = {
  title: string;
  interpretation: string;
  rationale: string;
  effectiveFrom?: string | null;
};

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function getAdminPreclearanceRulings(caseId: string) {
  return rpc<IntegrityPreclearanceRuling[]>("admin_integrity_preclearance_rulings", {
    _case_id: caseId,
  });
}

export async function recordAdminPreclearanceRuling(
  caseId: string,
  input: RecordPreclearanceRulingInput,
  expectedVersion: number,
) {
  return rpc<{
    ok: true;
    ruling_id: string;
    outcome: PreclearanceOutcome;
    rule_ids: string[];
  }>("studio2_integrity_record_preclearance_ruling", {
    p_case_id: caseId,
    p_outcome: input.outcome,
    p_summary: input.summary,
    p_rationale: input.rationale,
    p_rule_ids: input.ruleIds,
    ...governedIntegrityArgs(expectedVersion),
  });
}

export async function getReporterPreclearanceRulings(caseId: string) {
  return rpc<IntegrityPreclearanceRuling[]>("reporter_integrity_preclearance_rulings", {
    _case_id: caseId,
  });
}

export async function createInterpretationDraftFromPreclearance(
  caseId: string,
  rulingId: string,
  input: InterpretationDraftFromRulingInput,
) {
  return rpc<{
    ok: true;
    id: string;
    code: string;
    status: "draft";
    source_case_id: string;
    source_ruling_id: string;
  }>("admin_create_rule_interpretation_from_integrity_case", {
    _case_id: caseId,
    _ruling_id: rulingId,
    _title: input.title,
    _interpretation: input.interpretation,
    _rationale: input.rationale,
    _effective_from: input.effectiveFrom || null,
  });
}

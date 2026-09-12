import { supabase } from "@/integrations/supabase/client";

export type RuleInterpretationStatus = "draft" | "published" | "superseded";

export type RuleInterpretation = {
  id: string;
  code: string;
  title: string;
  question: string;
  interpretation: string;
  rationale: string;
  rule_ids: string[];
  status: RuleInterpretationStatus;
  effective_from: string | null;
  published_at: string | null;
  superseded_by: string | null;
  created_at?: string;
  updated_at?: string;
};

export type RuleInterpretationDraft = {
  title: string;
  question: string;
  interpretation: string;
  rationale: string;
  ruleIds: string[];
  effectiveFrom?: string | null;
};

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function getPublicRuleInterpretations(ruleId?: string | null) {
  return rpc<RuleInterpretation[]>("public_rule_interpretations", {
    _rule_id: ruleId?.trim() || null,
  });
}

export async function getAdminRuleInterpretations() {
  return rpc<RuleInterpretation[]>("admin_rule_interpretations");
}

export async function createRuleInterpretation(input: RuleInterpretationDraft) {
  return rpc<{ ok: true; id: string; code: string }>("admin_create_rule_interpretation", {
    _title: input.title,
    _question: input.question,
    _interpretation: input.interpretation,
    _rationale: input.rationale,
    _rule_ids: input.ruleIds,
    _effective_from: input.effectiveFrom || null,
  });
}

export async function updateRuleInterpretation(id: string, input: RuleInterpretationDraft) {
  return rpc<{ ok: true; id: string }>("admin_update_rule_interpretation", {
    _id: id,
    _title: input.title,
    _question: input.question,
    _interpretation: input.interpretation,
    _rationale: input.rationale,
    _rule_ids: input.ruleIds,
    _effective_from: input.effectiveFrom || null,
  });
}

export async function publishRuleInterpretation(id: string) {
  return rpc<{ ok: true; id: string; status: "published" }>(
    "admin_publish_rule_interpretation",
    { _id: id },
  );
}

export async function supersedeRuleInterpretation(oldId: string, replacementId: string) {
  return rpc<{ ok: true; id: string; superseded_by: string }>(
    "admin_supersede_rule_interpretation",
    { _old_id: oldId, _replacement_id: replacementId },
  );
}

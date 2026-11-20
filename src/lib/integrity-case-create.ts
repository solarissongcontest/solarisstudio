import { supabase } from "@/integrations/supabase/client";
import type { ProtectedCaseInput } from "@/lib/integrity-portal";

export type IntegritySubmissionIdentity = {
  operationId: string;
  idempotencyKey: string;
};

export type IdempotentProtectedCaseResult = {
  ok: true;
  operation_id: string;
  receipt_id: string;
  case_id: string;
  case_code: string;
  status: string;
  priority: string;
  created_at: string;
  replayed: boolean;
};

export async function createIdempotentProtectedIntegrityCase(
  identity: IntegritySubmissionIdentity,
  input: ProtectedCaseInput,
): Promise<IdempotentProtectedCaseResult> {
  const { data, error } = await (supabase as any).rpc(
    "v3_create_protected_integrity_case",
    {
      p_operation_id: identity.operationId,
      p_idempotency_key: identity.idempotencyKey,
      p_identity_mode: input.identityMode,
      p_case_kind: input.caseKind,
      p_category: input.category,
      p_summary: input.summary,
      p_details: input.details,
      p_observed_facts: input.observedFacts || null,
      p_uncertainties: input.uncertainties || null,
      p_related_countries: input.relatedCountries ?? [],
      p_edition_reference: input.editionReference || null,
    },
  );

  if (error) throw new Error(error.message);
  return data as IdempotentProtectedCaseResult;
}

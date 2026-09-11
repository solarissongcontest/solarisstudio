import { supabase } from "@/integrations/supabase/client";

export type SealedIntegrityCase = {
  id: string;
  public_code: string;
  summary: string;
  category: string;
  priority: "information" | "standard" | "high" | "urgent";
  status: string;
  active_request_id: string | null;
  active_request_status: "pending" | "approved" | null;
};

export type IdentityDisclosureStatus = "pending" | "approved" | "rejected" | "used" | "expired";

export type IdentityDisclosureRequest = {
  id: string;
  case_id: string;
  case_code: string;
  case_summary: string;
  priority: string;
  reason: string;
  status: IdentityDisclosureStatus;
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decision_reason: string | null;
  decided_at: string | null;
  approval_expires_at: string | null;
  disclosed_at: string | null;
};

export type RevealedSealedIdentity = {
  user_id: string;
  email: string | null;
  request_id: string;
};

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function listSealedIntegrityCases() {
  return rpc<SealedIntegrityCase[]>("admin_sealed_integrity_cases");
}

export async function listIdentityDisclosureRequests() {
  return rpc<IdentityDisclosureRequest[]>("admin_identity_disclosure_requests");
}

export async function requestSealedIdentityDisclosure(caseId: string, reason: string) {
  return rpc<{ ok: true; request_id: string; status: "pending" }>(
    "admin_request_sealed_identity_disclosure",
    { _case_id: caseId, _reason: reason },
  );
}

export async function decideSealedIdentityDisclosure(
  requestId: string,
  approve: boolean,
  reason: string,
) {
  return rpc<{
    ok: true;
    request_id: string;
    status: "approved" | "rejected";
    approval_expires_at: string | null;
  }>("admin_decide_sealed_identity_disclosure", {
    _request_id: requestId,
    _approve: approve,
    _reason: reason,
  });
}

export async function revealSealedIdentity(requestId: string) {
  return rpc<RevealedSealedIdentity>("admin_reveal_sealed_identity", {
    _request_id: requestId,
  });
}

export async function getCurrentIntegrityOrganizerId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user?.id ?? null;
}

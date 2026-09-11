import { supabase } from "@/integrations/supabase/client";

export type DueEvidenceDeletion = {
  id: string;
  case_id: string;
  case_code: string;
  title: string;
  storage_path: string | null;
  original_name: string | null;
  mime_type: string | null;
  retention_until: string;
  deletion_reason: string;
};

export type ExpiredEvidenceUpload = {
  token_id: string;
  case_id: string;
  object_path: string;
  original_name: string;
  expires_at: string;
  object_exists: boolean;
};

export type EvidenceAccessLogItem = {
  id: string;
  evidence_id: string | null;
  actor_role: "reporter" | "organizer" | "system";
  action: "access_descriptor" | "download_requested";
  detail: string | null;
  created_at: string;
};

type SignedEvidenceDownload = {
  url: string;
  expiresInSeconds: number;
  originalName: string | null;
  mimeType: string | null;
};

type EvidenceDownloadRequest =
  | { mode: "reporter"; caseId: string; evidenceId: string }
  | { mode: "organizer"; evidenceId: string };

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function createSignedDownload(request: EvidenceDownloadRequest) {
  const { data, error } = await supabase.functions.invoke("integrity-evidence-download", {
    body: request,
  });
  if (error) throw new Error(error.message || "Could not create a secure evidence download.");

  const result = data as SignedEvidenceDownload | { error?: string } | null;
  if (!result || "error" in result) {
    throw new Error(result?.error || "Could not create a secure evidence download.");
  }
  if (!result.url || result.expiresInSeconds !== 60) {
    throw new Error("Evidence download service returned an invalid secure link.");
  }
  return result;
}

export async function getProtectedEvidenceDownloadUrl(caseId: string, evidenceId: string) {
  return createSignedDownload({ mode: "reporter", caseId, evidenceId });
}

export async function getOrganizerEvidenceDownloadUrl(evidenceId: string) {
  return createSignedDownload({ mode: "organizer", evidenceId });
}

export async function setCaseEvidenceRetention(
  caseId: string,
  retentionUntil: string,
  reason: string,
) {
  return rpc<{ ok: true; case_id: string; retention_until: string }>(
    "admin_set_integrity_case_retention",
    {
      _case_id: caseId,
      _retention_until: retentionUntil,
      _reason: reason,
    },
  );
}

export async function scheduleEvidenceDeletion(
  evidenceId: string,
  deleteAfter: string,
  reason: string,
) {
  return rpc<{ ok: true; evidence_id: string; retention_until: string }>(
    "admin_schedule_integrity_evidence_deletion",
    {
      _evidence_id: evidenceId,
      _delete_after: deleteAfter,
      _reason: reason,
    },
  );
}

export async function cancelEvidenceDeletion(evidenceId: string, reason: string) {
  return rpc<{ ok: true; evidence_id: string; status: "active" }>(
    "admin_cancel_integrity_evidence_deletion",
    {
      _evidence_id: evidenceId,
      _reason: reason,
    },
  );
}

export async function listDueEvidenceDeletions() {
  return rpc<DueEvidenceDeletion[]>("admin_integrity_evidence_due_for_deletion");
}

export async function listExpiredEvidenceUploads() {
  return rpc<ExpiredEvidenceUpload[]>("admin_integrity_expired_evidence_uploads");
}

export async function getEvidenceAccessLog(caseId: string) {
  return rpc<EvidenceAccessLogItem[]>("admin_integrity_evidence_access_log", {
    _case_id: caseId,
  });
}

export async function deleteDueEvidence(item: DueEvidenceDeletion) {
  if (item.storage_path) {
    const { error } = await supabase.storage
      .from("integrity-evidence")
      .remove([item.storage_path]);
    if (error) throw new Error(error.message);
  }
  return rpc<{ ok: true; evidence_id: string; status: "deleted" }>(
    "admin_finalize_integrity_evidence_deletion",
    { _evidence_id: item.id },
  );
}

export async function cleanExpiredEvidenceUpload(item: ExpiredEvidenceUpload) {
  if (item.object_exists) {
    const { error } = await supabase.storage
      .from("integrity-evidence")
      .remove([item.object_path]);
    if (error) throw new Error(error.message);
  }
  return rpc<{ ok: true; token_id: string }>(
    "admin_discard_expired_evidence_upload",
    { _token_id: item.token_id },
  );
}

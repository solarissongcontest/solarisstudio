import { supabase } from "@/integrations/supabase/client";
import { sanitizeEvidenceFile, type EvidenceUploadDescriptor } from "@/lib/integrity-portal";

export type DueEvidenceDeletion = {
  id: string;
  case_id: string;
  case_code: string;
  title: string;
  original_name: string | null;
  mime_type: string | null;
  retention_until: string;
  deletion_reason: string;
};

export type ExpiredEvidenceUpload = {
  token_id: string;
  case_id: string;
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

export type EvidenceDerivativeKind = "redacted" | "disclosure" | "redacted_disclosure";

export type EvidenceDerivativeResult = {
  ok: true;
  evidence_id: string;
  source_evidence_id: string;
  kind: EvidenceDerivativeKind;
  visible_to_reporter: boolean;
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

type EvidenceLifecycleRequest =
  | { mode: "delete_evidence"; evidenceId: string }
  | { mode: "clean_expired_upload"; tokenId: string };

async function rpc<T>(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

async function createSignedDownload(request: EvidenceDownloadRequest): Promise<SignedEvidenceDownload> {
  const { data, error } = await supabase.functions.invoke("integrity-evidence-download", {
    body: request,
  });
  if (error) throw new Error(error.message || "Could not create a secure evidence download.");

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Evidence download service returned an invalid secure link.");
  }
  const result = data as Record<string, unknown>;
  if (typeof result.error === "string") {
    throw new Error(result.error || "Could not create a secure evidence download.");
  }
  if (typeof result.url !== "string" || !result.url.trim() || result.expiresInSeconds !== 60) {
    throw new Error("Evidence download service returned an invalid secure link.");
  }
  return {
    url: result.url,
    expiresInSeconds: 60,
    originalName: typeof result.originalName === "string" ? result.originalName : null,
    mimeType: typeof result.mimeType === "string" ? result.mimeType : null,
  };
}

async function runEvidenceLifecycle(request: EvidenceLifecycleRequest) {
  const { data, error } = await supabase.functions.invoke("integrity-evidence-lifecycle", {
    body: request,
  });
  if (error) throw new Error(error.message || "Could not complete the evidence lifecycle action.");

  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    throw new Error(result?.error || "Could not complete the evidence lifecycle action.");
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
  return runEvidenceLifecycle({ mode: "delete_evidence", evidenceId: item.id });
}

export async function cleanExpiredEvidenceUpload(item: ExpiredEvidenceUpload) {
  return runEvidenceLifecycle({ mode: "clean_expired_upload", tokenId: item.token_id });
}

export async function uploadOrganizerEvidenceDerivative(
  sourceEvidenceId: string,
  sourceFile: File,
  kind: EvidenceDerivativeKind,
  title: string,
  description: string,
  reason: string,
): Promise<EvidenceDerivativeResult> {
  const file = await sanitizeEvidenceFile(sourceFile);
  const descriptor = await rpc<EvidenceUploadDescriptor & { source_evidence_id: string; kind: EvidenceDerivativeKind }>(
    "admin_create_integrity_evidence_derivative_upload",
    {
      _source_evidence_id: sourceEvidenceId,
      _name: file.name,
      _mime: file.type || "text/plain",
      _size: file.size,
      _kind: kind,
    },
  );

  const { error: uploadError } = await supabase.storage
    .from(descriptor.bucket)
    .upload(descriptor.object_path, file, {
      upsert: false,
      contentType: file.type || "text/plain",
      cacheControl: "0",
    });
  if (uploadError) throw new Error(uploadError.message);

  return rpc<EvidenceDerivativeResult>("admin_finalize_integrity_evidence_derivative", {
    _token_id: descriptor.token_id,
    _title: title,
    _description: description || null,
    _reason: reason,
  });
}

export async function createOrganizerEvidenceDisclosureCopy(
  sourceEvidenceId: string,
  input: {
    title: string;
    description: string;
    externalUrl?: string;
    redacted?: boolean;
    reason: string;
  },
): Promise<EvidenceDerivativeResult> {
  return rpc<EvidenceDerivativeResult>("admin_create_integrity_evidence_disclosure_copy", {
    _source_evidence_id: sourceEvidenceId,
    _title: input.title,
    _description: input.description,
    _external_url: input.externalUrl || null,
    _redacted: input.redacted ?? false,
    _reason: input.reason,
  });
}

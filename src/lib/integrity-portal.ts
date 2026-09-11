import { createClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import type {
  IntegrityCaseKind,
  IntegrityCaseSnapshot,
  IntegrityCategory,
  IntegrityIdentityMode,
  ProtectedCaseListItem,
} from "@/lib/integrity";

type RpcResult<T> = { data: T | null; error: { message: string } | null };

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = (await (supabase as any).rpc(name, args)) as RpcResult<T>;
  if (error) throw new Error(error.message);
  return data as T;
}

export type ProtectedCaseInput = {
  identityMode: Exclude<IntegrityIdentityMode, "anonymous">;
  caseKind: IntegrityCaseKind;
  category: IntegrityCategory;
  summary: string;
  details: string;
  observedFacts?: string;
  uncertainties?: string;
  relatedCountries?: string[];
  editionReference?: string;
};

export async function createProtectedIntegrityCase(input: ProtectedCaseInput) {
  return rpc<{ ok: true; case_id: string; case_code: string }>(
    "create_protected_integrity_case",
    {
      _identity_mode: input.identityMode,
      _case_kind: input.caseKind,
      _category: input.category,
      _summary: input.summary,
      _details: input.details,
      _observed_facts: input.observedFacts || null,
      _uncertainties: input.uncertainties || null,
      _related_countries: input.relatedCountries ?? [],
      _edition_reference: input.editionReference || null,
    },
  );
}

export async function listProtectedIntegrityCases() {
  return rpc<ProtectedCaseListItem[]>("reporter_integrity_cases");
}

export async function getProtectedIntegrityCase(caseId: string) {
  return rpc<IntegrityCaseSnapshot>("reporter_integrity_case", {
    _case_id: caseId,
  });
}

export async function replyProtectedIntegrityCase(caseId: string, body: string) {
  return rpc<IntegrityCaseSnapshot>("reporter_reply_integrity_case", {
    _case_id: caseId,
    _body: body,
  });
}

export async function getCurrentIntegrityUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export type EvidenceUploadDescriptor = {
  token_id: string;
  object_path: string;
  bucket: string;
};

export async function sanitizeEvidenceFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  if (typeof window === "undefined" || typeof document === "undefined") return file;

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) return file;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const outputType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Could not sanitize image"))),
      outputType,
      outputType === "image/jpeg" ? 0.92 : undefined,
    );
  });
  const extension = outputType === "image/jpeg" ? ".jpg" : ".png";
  const baseName = file.name.replace(/\.[^.]+$/, "") || "evidence";
  return new File([blob], `${baseName}${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}

function anonymousBrowserClient() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: undefined,
    },
  });
}

export async function uploadAnonymousEvidence(
  caseCode: string,
  recoveryKey: string,
  sourceFile: File,
): Promise<IntegrityCaseSnapshot> {
  const client = anonymousBrowserClient();
  const file = await sanitizeEvidenceFile(sourceFile);
  const { data: descriptor, error: prepareError } = await (client as any).rpc(
    "public_create_anonymous_evidence_upload",
    {
      _case_code: caseCode,
      _recovery_key: recoveryKey,
      _name: file.name,
      _mime: file.type || "text/plain",
      _size: file.size,
    },
  );
  if (prepareError) throw new Error(prepareError.message);
  const upload = descriptor as EvidenceUploadDescriptor;

  const { error: uploadError } = await client.storage
    .from(upload.bucket)
    .upload(upload.object_path, file, {
      upsert: false,
      contentType: file.type || "text/plain",
      cacheControl: "0",
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data: finalized, error: finalizeError } = await (client as any).rpc(
    "public_finalize_anonymous_evidence",
    {
      _case_code: caseCode,
      _recovery_key: recoveryKey,
      _token_id: upload.token_id,
    },
  );
  if (finalizeError) throw new Error(finalizeError.message);
  return (finalized as { snapshot: IntegrityCaseSnapshot }).snapshot;
}

export async function uploadProtectedEvidence(caseId: string, sourceFile: File) {
  const file = await sanitizeEvidenceFile(sourceFile);
  const descriptor = await rpc<EvidenceUploadDescriptor>(
    "create_protected_evidence_upload",
    {
      _case_id: caseId,
      _name: file.name,
      _mime: file.type || "text/plain",
      _size: file.size,
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

  const finalized = await rpc<{ snapshot: IntegrityCaseSnapshot }>(
    "finalize_protected_evidence",
    {
      _case_id: caseId,
      _token_id: descriptor.token_id,
    },
  );
  return finalized.snapshot;
}

export async function getPublicIntegrityStats() {
  return rpc<{
    total_cases: number;
    open_cases: number;
    resolved_cases: number;
    violations_confirmed: number;
    by_category: Record<string, number>;
  }>("public_integrity_stats");
}

export async function getPublicIntegrityDecisions() {
  return rpc<
    Array<{
      id: string;
      title: string;
      category: string;
      summary: string;
      rationale: string;
      rule_ids: string[];
      published_at: string;
    }>
  >("public_integrity_decisions");
}

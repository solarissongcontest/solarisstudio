import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const vault = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910213300_integrity_evidence_vault.sql"),
  "utf8",
);
const lifecycle = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911160500_integrity_evidence_lifecycle.sql"),
  "utf8",
);
const cleanup = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911160600_integrity_evidence_cleanup.sql"),
  "utf8",
);
const hardening = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911160900_integrity_evidence_interface_hardening.sql"),
  "utf8",
);
const signedBoundary = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161400_integrity_evidence_signed_url_boundary.sql"),
  "utf8",
);
const deletionBoundary = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161500_integrity_evidence_deletion_boundary.sql"),
  "utf8",
);
const downloadFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/integrity-evidence-download/index.ts"),
  "utf8",
);
const lifecycleFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/integrity-evidence-lifecycle/index.ts"),
  "utf8",
);
const api = readFileSync(
  resolve(process.cwd(), "src/lib/integrity-evidence.ts"),
  "utf8",
);
const protectedPortal = readFileSync(
  resolve(process.cwd(), "src/components/integrity/TrustIntegrityHub.tsx"),
  "utf8",
);
const investigationRoute = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-case.$caseId.tsx"),
  "utf8",
);
const adminRoute = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-evidence.tsx"),
  "utf8",
);

describe("Integrity evidence lifecycle", () => {
  it("uses a private MIME- and size-restricted evidence bucket", () => {
    expect(vault).toContain("'integrity-evidence'");
    expect(vault).toContain("false,");
    expect(vault).toContain("15728640");
    expect(vault).toContain("image/png");
    expect(vault).toContain("application/pdf");
    expect(vault).toContain("text/plain");
  });

  it("removes final browser SELECT access to private evidence objects", () => {
    expect(vault).toContain('create policy "integrity evidence protected read"');
    expect(signedBoundary).toContain('drop policy if exists "integrity evidence protected read" on storage.objects');
    expect(signedBoundary).toContain("revoke all on function public.integrity_can_read_evidence_object(text) from authenticated");
    expect(signedBoundary).not.toContain("grant execute");
  });

  it("keeps the pre-signing reporter policy narrow while migrations transition to server signing", () => {
    expect(lifecycle).toContain("join public.integrity_case_evidence e");
    expect(lifecycle).toContain("e.storage_path = _name");
    expect(lifecycle).toContain("e.visible_to_reporter = true");
    expect(lifecycle).toContain("e.lifecycle_status = 'active'");
    expect(lifecycle).toContain("c.reporter_user_id = auth.uid()");
  });

  it("keeps evidence access logs outside direct client table access", () => {
    expect(lifecycle).toContain("create table if not exists public.integrity_evidence_access_log");
    expect(lifecycle).toContain("alter table public.integrity_evidence_access_log enable row level security");
    expect(lifecycle).toContain("revoke all on public.integrity_evidence_access_log from anon, authenticated");
    expect(lifecycle).toContain("reporter_integrity_evidence_access_descriptor");
    expect(lifecycle).toContain("admin_integrity_evidence_access_descriptor");
  });

  it("authorizes and logs the request before the server mints a 60-second signed URL", () => {
    expect(lifecycle).toContain("insert into public.integrity_evidence_access_log");
    expect(downloadFunction).toContain('_action: "download_requested"');
    expect(downloadFunction).toContain('"reporter_integrity_evidence_access_descriptor"');
    expect(downloadFunction).toContain('"admin_integrity_evidence_access_descriptor"');
    expect(downloadFunction).toContain("service.storage");
    expect(downloadFunction).toContain("createSignedUrl(descriptor.storage_path, SIGNED_URL_TTL_SECONDS");
    expect(downloadFunction).toContain("const SIGNED_URL_TTL_SECONDS = 60");
  });

  it("keeps service credentials and storage paths inside the download Edge Function boundary", () => {
    expect(downloadFunction).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(downloadFunction).toContain("descriptor.storage_path");
    expect(downloadFunction).not.toContain("storage_path: descriptor.storage_path");
    expect(api).toContain('supabase.functions.invoke("integrity-evidence-download"');
    expect(api).not.toContain("createSignedUrl(");
  });

  it("lets protected reporters retrieve visible files only through the audited signed-download API", () => {
    expect(protectedPortal).toContain("getProtectedEvidenceDownloadUrl");
    expect(protectedPortal).toContain("downloadMutation.mutate(item.id)");
    expect(protectedPortal).toContain("Secure download");
    expect(protectedPortal).toContain("Audited access · signed link expires after 60 seconds.");
    expect(protectedPortal).not.toContain("getOrganizerEvidenceDownloadUrl");
  });

  it("lets organizers retrieve file evidence through the audited vault instead of exposing storage paths", () => {
    expect(investigationRoute).toContain("getOrganizerEvidenceDownloadUrl");
    expect(investigationRoute).toContain("downloadMutation.mutate(item.id)");
    expect(investigationRoute).toContain("Private file retrieval uses audit-logged 60-second signed URLs");
    expect(investigationRoute).toContain('to="/admin/integrity-evidence"');
    expect(investigationRoute).not.toContain("storage_path");
  });

  it("sanitizes organizer case snapshots while exposing lifecycle metadata needed by the desk", () => {
    expect(hardening).toContain("create or replace function public.admin_integrity_case(_case_id uuid)");
    expect(hardening).toContain("'lifecycle_status', ev.lifecycle_status");
    expect(hardening).toContain("'retention_until', ev.retention_until");
    expect(hardening).toContain("'deletion_reason', ev.deletion_reason");
    expect(hardening).not.toContain("jsonb_agg(to_jsonb(ev)");
  });

  it("stops minting organizer download descriptors after scheduled retention expires", () => {
    expect(hardening).toContain("lifecycle_status = 'active'");
    expect(hardening).toContain("lifecycle_status = 'scheduled_for_deletion' and retention_until > now()");
    expect(hardening).toContain("Evidence file is not available");
  });

  it("inherits case retention and supports explicit schedule/cancel lifecycle", () => {
    expect(lifecycle).toContain("integrity_evidence_inherit_case_retention");
    expect(lifecycle).toContain("admin_set_integrity_case_retention");
    expect(lifecycle).toContain("admin_schedule_integrity_evidence_deletion");
    expect(lifecycle).toContain("admin_cancel_integrity_evidence_deletion");
    expect(lifecycle).toContain("scheduled_for_deletion");
    expect(lifecycle).toContain("retention.updated");
  });

  it("removes generic browser DELETE permission from the evidence bucket", () => {
    expect(vault).toContain('create policy "integrity evidence organizer delete"');
    expect(deletionBoundary).toContain('drop policy if exists "integrity evidence organizer delete" on storage.objects');
    expect(api).not.toContain('.remove([');
  });

  it("validates due evidence server-side before deleting storage bytes", () => {
    expect(deletionBoundary).toContain("admin_integrity_evidence_deletion_descriptor");
    expect(deletionBoundary).toContain("Evidence is not scheduled for deletion");
    expect(deletionBoundary).toContain("Evidence retention period has not expired");
    expect(lifecycleFunction).toContain('"admin_integrity_evidence_deletion_descriptor"');
    expect(lifecycleFunction).toContain("service.storage");
    expect(lifecycleFunction).toContain('"admin_finalize_integrity_evidence_deletion"');
  });

  it("cleans expired unfinished uploads only through a server-validated lifecycle action", () => {
    expect(cleanup).toContain("admin_discard_expired_evidence_upload");
    expect(cleanup).toContain("Finalised evidence upload tokens cannot be discarded");
    expect(cleanup).toContain("Evidence upload token has not expired");
    expect(cleanup).toContain("Delete the orphaned private storage object before discarding its upload token");
    expect(deletionBoundary).toContain("admin_integrity_expired_upload_deletion_descriptor");
    expect(lifecycleFunction).toContain('"admin_integrity_expired_upload_deletion_descriptor"');
    expect(lifecycleFunction).toContain('"admin_discard_expired_evidence_upload"');
    expect(api).toContain('supabase.functions.invoke("integrity-evidence-lifecycle"');
  });

  it("does not expose deletion storage paths through browser queue APIs", () => {
    expect(deletionBoundary).not.toContain("'storage_path', e.storage_path");
    expect(deletionBoundary).not.toContain("'object_path', t.object_path");
    expect(api).not.toContain("storage_path:");
    expect(api).not.toContain("object_path:");
  });

  it("does not mark evidence deleted while private storage bytes still exist", () => {
    expect(lifecycle).toContain("Evidence retention period has not expired");
    expect(lifecycle).toContain("Delete the private storage object before finalising evidence deletion");
    expect(lifecycle).toContain("set lifecycle_status = 'deleted'");
    expect(lifecycle).toContain("visible_to_reporter = false");
    expect(lifecycleFunction).toContain("Storage changed but finalization failed");
  });

  it("gives organizers an explicit operational lifecycle queue without exposing private object paths", () => {
    expect(adminRoute).toContain("Evidence lifecycle");
    expect(adminRoute).toContain("listDueEvidenceDeletions");
    expect(adminRoute).toContain("listExpiredEvidenceUploads");
    expect(adminRoute).toContain("deleteDueEvidence");
    expect(adminRoute).toContain("cleanExpiredEvidenceUpload");
    expect(adminRoute).toContain("Deletion is deliberately two-step");
    expect(adminRoute).toContain("Private storage location hidden from the interface.");
    expect(adminRoute).not.toContain("item.object_path");
  });

  it("requires explicit confirmation before destructive evidence lifecycle actions", () => {
    expect(adminRoute).toContain("window.confirm");
    expect(adminRoute).toContain("Permanently delete this private evidence item");
    expect(adminRoute).toContain("Clean this expired unfinished upload");
  });
});

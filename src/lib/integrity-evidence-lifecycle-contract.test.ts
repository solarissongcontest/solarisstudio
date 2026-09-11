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

  it("never grants anonymous direct evidence reads", () => {
    expect(vault).toContain('create policy "integrity evidence protected read"');
    expect(vault).toContain("on storage.objects for select to authenticated");
    expect(vault).not.toContain("on storage.objects for select to anon");
  });

  it("requires protected evidence to be explicitly reporter-visible before storage read", () => {
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

  it("logs download requests before minting short-lived signed URLs", () => {
    expect(lifecycle).toContain("insert into public.integrity_evidence_access_log");
    expect(api).toContain('_action: "download_requested"');
    expect(api).toContain("createSignedUrl(descriptor.storage_path, 60");
    expect(api).toContain("expiresInSeconds: 60");
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
    expect(investigationRoute).toContain("Private file retrieval is audit-logged");
    expect(investigationRoute).toContain('to="/admin/integrity-evidence"');
    expect(investigationRoute).not.toContain("storage_path");
  });

  it("inherits case retention and supports explicit schedule/cancel lifecycle", () => {
    expect(lifecycle).toContain("integrity_evidence_inherit_case_retention");
    expect(lifecycle).toContain("admin_set_integrity_case_retention");
    expect(lifecycle).toContain("admin_schedule_integrity_evidence_deletion");
    expect(lifecycle).toContain("admin_cancel_integrity_evidence_deletion");
    expect(lifecycle).toContain("scheduled_for_deletion");
    expect(lifecycle).toContain("retention.updated");
  });

  it("does not mark evidence deleted while private storage bytes still exist", () => {
    expect(lifecycle).toContain("Evidence retention period has not expired");
    expect(lifecycle).toContain("Delete the private storage object before finalising evidence deletion");
    expect(lifecycle).toContain("set lifecycle_status = 'deleted'");
    expect(lifecycle).toContain("visible_to_reporter = false");
    expect(api).toContain('.from("integrity-evidence")');
    expect(api).toContain("admin_finalize_integrity_evidence_deletion");
  });

  it("cleans abandoned uploads only after an orphaned storage object is gone", () => {
    expect(lifecycle).toContain("admin_integrity_expired_evidence_uploads");
    expect(cleanup).toContain("admin_discard_expired_evidence_upload");
    expect(cleanup).toContain("Finalised evidence upload tokens cannot be discarded");
    expect(cleanup).toContain("Evidence upload token has not expired");
    expect(cleanup).toContain("Delete the orphaned private storage object before discarding its upload token");
    expect(api).toContain("cleanExpiredEvidenceUpload");
  });

  it("gives organizers an explicit operational lifecycle queue", () => {
    expect(adminRoute).toContain("Evidence lifecycle");
    expect(adminRoute).toContain("listDueEvidenceDeletions");
    expect(adminRoute).toContain("listExpiredEvidenceUploads");
    expect(adminRoute).toContain("deleteDueEvidence");
    expect(adminRoute).toContain("cleanExpiredEvidenceUpload");
    expect(adminRoute).toContain("Deletion is deliberately two-step");
  });
});
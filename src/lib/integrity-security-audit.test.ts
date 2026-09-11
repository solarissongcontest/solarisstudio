import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const core = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910213000_integrity_core.sql"),
  "utf8",
);
const reporting = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910213100_integrity_reporting_and_review.sql"),
  "utf8",
);
const governance = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910213200_integrity_case_governance.sql"),
  "utf8",
);
const evidence = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910213300_integrity_evidence_vault.sql"),
  "utf8",
);
const evidenceLifecycle = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911160500_integrity_evidence_lifecycle.sql"),
  "utf8",
);
const evidenceBoundary = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161400_integrity_evidence_signed_url_boundary.sql"),
  "utf8",
);
const evidenceDeletionBoundary = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161500_integrity_evidence_deletion_boundary.sql"),
  "utf8",
);
const evidenceDisclosure = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161600_integrity_evidence_disclosure.sql"),
  "utf8",
);
const preclearance = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161700_integrity_preclearance_rulings.sql"),
  "utf8",
);
const interpretationSources = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161800_rule_interpretation_case_sources.sql"),
  "utf8",
);
const evidenceDownloadFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/integrity-evidence-download/index.ts"),
  "utf8",
);
const evidenceLifecycleFunction = readFileSync(
  resolve(process.cwd(), "supabase/functions/integrity-evidence-lifecycle/index.ts"),
  "utf8",
);
const anonymousFns = readFileSync(
  resolve(process.cwd(), "src/lib/integrity.functions.ts"),
  "utf8",
);
const portal = readFileSync(
  resolve(process.cwd(), "src/lib/integrity-portal.ts"),
  "utf8",
);
const evidenceApi = readFileSync(
  resolve(process.cwd(), "src/lib/integrity-evidence.ts"),
  "utf8",
);
const disclosureRoute = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-disclosure.tsx"),
  "utf8",
);
const preclearanceApi = readFileSync(
  resolve(process.cwd(), "src/lib/integrity-preclearance.ts"),
  "utf8",
);

describe("Trust & Integrity privacy boundary audit", () => {
  it("hard-enforces the three identity modes in the case schema", () => {
    expect(core).toContain("'anonymous', 'sealed', 'confidential'");
    expect(core).toContain("fully_anonymous_has_no_reporter_identity");
    expect(core).toContain("identity_mode <> 'anonymous' or reporter_user_id is null");
    expect(core).toContain("protected_reports_have_reporter_identity");
  });

  it("keeps fully anonymous server calls sessionless", () => {
    expect(anonymousFns).toContain("persistSession: false");
    expect(anonymousFns).toContain("autoRefreshToken: false");
    expect(anonymousFns).toContain("detectSessionInUrl: false");
    expect(anonymousFns).toContain("storage: undefined");
    expect(anonymousFns).not.toContain("supabase.auth.getSession");
  });

  it("uses a separate sessionless browser client for anonymous evidence and appeal recovery", () => {
    expect(portal).toContain("function anonymousBrowserClient()");
    expect(portal).toContain("persistSession: false");
    expect(portal).toContain("detectSessionInUrl: false");
    expect(portal).toContain("public_create_anonymous_evidence_upload");
    expect(portal).toContain("public_finalize_anonymous_evidence");
    expect(portal).toContain("public_get_anonymous_integrity_resolution");
    expect(portal).toContain("public_submit_anonymous_integrity_appeal");
  });

  it("stores only a SHA-256 digest of anonymous recovery secrets", () => {
    expect(reporting).toContain("recovery_secret_hash");
    expect(reporting).toContain("extensions.digest");
    expect(reporting).toContain("'sha256'");
    expect(reporting).not.toMatch(/insert into public\.integrity_case_access\([^)]*recovery_key/i);
  });

  it("does not expose reporter_user_id in the reporter-facing snapshot", () => {
    const snapshotStart = core.indexOf("create or replace function public.integrity_case_snapshot");
    expect(snapshotStart).toBeGreaterThan(-1);
    const snapshot = core.slice(snapshotStart);
    expect(snapshot).not.toContain("'reporter_user_id'");
    expect(snapshot).not.toContain("'recovery_secret_hash'");
  });

  it("keeps direct Integrity tables closed to anon and authenticated clients", () => {
    const protectedTables = [
      "integrity_cases",
      "integrity_case_access",
      "integrity_case_messages",
      "integrity_case_internal_notes",
      "integrity_case_events",
      "integrity_case_rule_links",
      "integrity_case_findings",
      "integrity_case_reviewers",
      "integrity_case_relations",
      "integrity_case_requests",
      "integrity_case_evidence",
      "integrity_evidence_upload_tokens",
      "integrity_public_decisions",
    ];

    for (const table of protectedTables) {
      expect(core).toContain(`alter table public.${table} enable row level security`);
      expect(core).toContain(`revoke all on public.${table} from anon, authenticated`);
    }
    expect(preclearance).toContain("alter table public.integrity_preclearance_rulings enable row level security");
    expect(preclearance).toContain("revoke all on public.integrity_preclearance_rulings from anon, authenticated");
    expect(interpretationSources).toContain("alter table public.ssc_rule_interpretation_sources enable row level security");
    expect(interpretationSources).toContain("revoke all on public.ssc_rule_interpretation_sources from anon, authenticated");
  });

  it("prevents ordinary case reviewers from revealing sealed identities", () => {
    expect(governance).toContain("Reporter identity is sealed and cannot be revealed to case reviewers");
    expect(governance).toContain("Fully anonymous cases have no reporter identity");
    expect(governance).toContain("Confidential reporter identity was accessed by an organizer");
    expect(governance).toContain("'identity.accessed'");
  });

  it("requires ownership for protected reporter reads and replies", () => {
    expect(reporting).toContain("reporter_integrity_case(_case_id uuid)");
    expect(reporting).toContain("c.reporter_user_id = auth.uid()");
    expect(reporting).toContain("reporter_reply_integrity_case(_case_id uuid, _body text)");
    expect(preclearance).toContain("c.id = _case_id and c.reporter_user_id = auth.uid()");
  });

  it("keeps evidence storage private and token-gated for uploads", () => {
    expect(evidence).toContain("insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)");
    expect(evidence).toMatch(/'integrity-evidence',\s*'integrity-evidence',\s*false,/i);
    expect(evidence).toContain("integrity_evidence_upload_tokens");
    expect(evidence).toContain("expires_at > now()");
    expect(evidence).toContain("used_at is null");
    expect(evidence).toContain("bucket_id = 'integrity-evidence'");
  });

  it("removes authenticated browser SELECT access after audited server-side signing is introduced", () => {
    expect(evidence).toContain('create policy "integrity evidence protected read"');
    expect(evidenceBoundary).toContain('drop policy if exists "integrity evidence protected read" on storage.objects');
    expect(evidenceBoundary).toContain("revoke all on function public.integrity_can_read_evidence_object(text) from authenticated");
    expect(evidenceApi).not.toContain("createSignedUrl(");
  });

  it("mints evidence links only after a caller-scoped descriptor RPC records the access request", () => {
    expect(evidenceDownloadFunction).toContain("authClient.auth.getUser(token)");
    expect(evidenceDownloadFunction).toContain('"reporter_integrity_evidence_access_descriptor"');
    expect(evidenceDownloadFunction).toContain('"admin_integrity_evidence_access_descriptor"');
    expect(evidenceDownloadFunction).toContain('_action: "download_requested"');
    expect(evidenceDownloadFunction).toContain("service.storage");
    expect(evidenceDownloadFunction).toContain("SIGNED_URL_TTL_SECONDS = 60");
    expect(evidenceDownloadFunction).toContain('descriptor.bucket !== EVIDENCE_BUCKET');
  });

  it("removes generic organizer browser DELETE access and validates lifecycle deletion server-side", () => {
    expect(evidence).toContain('create policy "integrity evidence organizer delete"');
    expect(evidenceDeletionBoundary).toContain('drop policy if exists "integrity evidence organizer delete" on storage.objects');
    expect(evidenceDeletionBoundary).toContain("admin_integrity_evidence_deletion_descriptor");
    expect(evidenceDeletionBoundary).toContain("admin_integrity_expired_upload_deletion_descriptor");
    expect(evidenceLifecycleFunction).toContain("authClient.auth.getUser(token)");
    expect(evidenceLifecycleFunction).toContain("service.storage");
    expect(evidenceApi).not.toContain('.remove([');
  });

  it("does not expose private evidence object paths through browser lifecycle data", () => {
    expect(evidenceDeletionBoundary).not.toContain("'storage_path', e.storage_path");
    expect(evidenceDeletionBoundary).not.toContain("'object_path', t.object_path");
    expect(evidenceApi).not.toContain("storage_path:");
    expect(evidenceApi).not.toContain("object_path:");
    expect(disclosureRoute).not.toContain("storage_path");
  });

  it("creates evidence disclosure copies without mutating original evidence", () => {
    expect(evidenceDisclosure).toContain("derivative_source_evidence_id");
    expect(evidenceDisclosure).toContain("disclosure_copy_of_id");
    expect(evidenceDisclosure).toContain("redacted_from_id");
    expect(evidenceDisclosure).toContain("Derivative source must belong to the upload case");
    expect(evidenceDisclosure).not.toMatch(/update public\.integrity_case_evidence\s+set\s+(title|description|storage_path)/i);
    expect(disclosureRoute).toContain("The source row stays unchanged");
    expect(disclosureRoute).toContain("getOrganizerEvidenceDownloadUrl");
  });

  it("keeps private rule-question provenance out of public interpretations", () => {
    expect(preclearance).toContain("Pre-clearance rulings are only available for private rule questions");
    expect(interpretationSources).toContain("Only a private rule question can seed an Official Interpretation");
    expect(interpretationSources).toContain("where r.id = _ruling_id and r.case_id = _case_id");
    expect(interpretationSources).toContain("v_ruling.summary");
    expect(interpretationSources).not.toContain("c.details");
    expect(preclearanceApi).toContain("reporter_integrity_preclearance_rulings");
    expect(preclearanceApi).not.toContain("public_integrity_preclearance");
  });

  it("keeps the service role key confined to evidence Edge Functions", () => {
    expect(evidenceDownloadFunction).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(evidenceLifecycleFunction).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(evidenceApi).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(portal).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(preclearanceApi).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("re-encodes image evidence before upload to remove ordinary embedded metadata", () => {
    expect(portal).toContain("createImageBitmap");
    expect(portal).toContain("canvas.toBlob");
    expect(portal).toContain("sanitizeEvidenceFile");
  });
});

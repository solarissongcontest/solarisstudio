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
const evidence = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910213300_integrity_evidence_vault.sql"),
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

  it("uses a separate sessionless browser client for anonymous evidence uploads", () => {
    expect(portal).toContain("function anonymousBrowserClient()");
    expect(portal).toContain("persistSession: false");
    expect(portal).toContain("detectSessionInUrl: false");
    expect(portal).toContain("public_create_anonymous_evidence_upload");
    expect(portal).toContain("public_finalize_anonymous_evidence");
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
  });

  it("prevents ordinary case reviewers from revealing sealed identities", () => {
    expect(reporting).toContain("Reporter identity is sealed and cannot be revealed to case reviewers");
    expect(reporting).toContain("Fully anonymous cases have no reporter identity");
    expect(reporting).toContain("Confidential reporter identity was accessed by an organizer");
  });

  it("requires ownership for protected reporter reads and replies", () => {
    expect(reporting).toContain("reporter_integrity_case(_case_id uuid)");
    expect(reporting).toContain("c.reporter_user_id = auth.uid()");
    expect(reporting).toContain("reporter_reply_integrity_case(_case_id uuid, _body text)");
  });

  it("keeps evidence storage private and token-gated", () => {
    expect(evidence).toContain("integrity-evidence");
    expect(evidence).toMatch(/public\s*=\s*false/i);
    expect(evidence).toContain("integrity_evidence_upload_tokens");
    expect(evidence).toContain("expires_at");
    expect(evidence).toContain("used_at");
  });

  it("re-encodes image evidence before upload to remove ordinary embedded metadata", () => {
    expect(portal).toContain("createImageBitmap");
    expect(portal).toContain("canvas.toBlob");
    expect(portal).toContain("sanitizeEvidenceFile");
  });
});

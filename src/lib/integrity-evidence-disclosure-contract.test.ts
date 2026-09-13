import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260911161600_integrity_evidence_disclosure.sql"),
  "utf8",
);
const evidenceApi = readFileSync(resolve(process.cwd(), "src/lib/integrity-evidence.ts"), "utf8");
const disclosureRoute = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-disclosure.tsx"),
  "utf8",
);
const adminNav = readFileSync(resolve(process.cwd(), "src/components/admin/admin-navigation.ts"), "utf8");

describe("Integrity evidence disclosure and redaction", () => {
  it("keeps evidence derivatives append-only and linked to an original", () => {
    expect(migration).toContain("derivative_source_evidence_id");
    expect(migration).toContain("derivative_kind");
    expect(migration).toContain("redacted_from_id");
    expect(migration).toContain("disclosure_copy_of_id");
    expect(migration).not.toMatch(/update public\.integrity_case_evidence\s+set\s+(title|description|storage_path)/i);
  });

  it("enforces same-case lineage and blocks self references", () => {
    expect(migration).toContain("Redaction source must belong to the same case");
    expect(migration).toContain("Disclosure source must belong to the same case");
    expect(migration).toContain("integrity_evidence_not_own_redaction_source");
    expect(migration).toContain("integrity_evidence_not_own_disclosure_source");
    expect(migration).toContain("integrity_evidence_validate_lineage");
  });

  it("does not allow deleted evidence to become a new derivative", () => {
    expect(migration).toContain("Deleted evidence cannot be used as a derivative source");
    expect(migration).toContain("Deleted evidence cannot be disclosed");
  });

  it("requires a protected upload token for file derivatives", () => {
    expect(migration).toContain("admin_create_integrity_evidence_derivative_upload");
    expect(migration).toContain("admin_finalize_integrity_evidence_derivative");
    expect(migration).toContain("Evidence derivative upload token is invalid or expired");
    expect(migration).toContain("Evidence derivative file has not been uploaded");
  });

  it("forces disclosure derivatives reporter-visible but keeps internal redactions private", () => {
    expect(migration).toContain("v_visible := v_token.derivative_kind in ('disclosure', 'redacted_disclosure')");
    expect(migration).toContain("'evidence.disclosure_created'");
    expect(migration).toContain("'evidence.redacted'");
    expect(migration).toContain("visible_to_reporter");
  });

  it("requires organizers and leaves raw storage paths out of the client API result", () => {
    expect(migration).toContain("if not public.integrity_is_organizer()");
    expect(evidenceApi).toContain("uploadOrganizerEvidenceDerivative");
    expect(evidenceApi).toContain("createOrganizerEvidenceDisclosureCopy");
    expect(evidenceApi).toContain("admin_create_integrity_evidence_derivative_upload");
    expect(evidenceApi).toContain("admin_finalize_integrity_evidence_derivative");
    expect(evidenceApi).not.toContain("createSignedUrl");
  });

  it("provides an organizer disclosure desk that uses secure downloads and derivative APIs", () => {
    expect(disclosureRoute).toContain("getOrganizerEvidenceDownloadUrl");
    expect(disclosureRoute).toContain("uploadOrganizerEvidenceDerivative");
    expect(disclosureRoute).toContain("createOrganizerEvidenceDisclosureCopy");
    expect(disclosureRoute).toContain("Evidence disclosure desk");
    expect(disclosureRoute).toContain("The source row stays unchanged");
    expect(disclosureRoute).toContain("Reporter-visible derivative");
    expect(disclosureRoute).not.toContain("storage_path");
    expect(disclosureRoute).not.toContain("createSignedUrl");
  });

  it("makes the disclosure desk discoverable in Organizer navigation", () => {
    expect(adminNav).toContain('"Disclosure",');
    expect(adminNav).toContain('"/admin/integrity-disclosure"');
  });
});

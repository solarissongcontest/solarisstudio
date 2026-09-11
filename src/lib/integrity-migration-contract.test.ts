import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const core = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910213000_integrity_core.sql"),
  "utf8",
);
const reporting = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260910213100_integrity_reporting_and_review.sql",
  ),
  "utf8",
);

describe("integrity case security contract", () => {
  it("forces fully anonymous cases to have no reporter account identity", () => {
    expect(core).toContain("fully_anonymous_has_no_reporter_identity");
    expect(core).toContain(
      "identity_mode <> 'anonymous' or reporter_user_id is null",
    );
    expect(reporting).toMatch(/v_code, _case_kind, _category, 'anonymous', null,/s);
  });

  it("requires protected identity modes to retain an account recovery identity", () => {
    expect(core).toContain("protected_reports_have_reporter_identity");
    expect(core).toContain(
      "identity_mode = 'anonymous' or reporter_user_id is not null",
    );
    expect(reporting).toContain("create_protected_integrity_case");
    expect(reporting).toContain("'sealed', 'confidential'");
  });

  it("stores only a SHA-256 anonymous recovery-secret digest", () => {
    expect(core).toContain("recovery_secret_hash");
    expect(reporting).toContain("extensions.digest");
    expect(reporting).toContain("'sha256'");
    expect(core).not.toMatch(/recovery_secret\s+text/i);
  });

  it("revokes direct case-table access and exposes narrow RPCs instead", () => {
    expect(core).toContain(
      "alter table public.integrity_cases enable row level security",
    );
    expect(core).toContain(
      "revoke all on public.integrity_cases from anon, authenticated",
    );
    expect(reporting).toContain("public_create_anonymous_integrity_case");
    expect(reporting).toContain("public_get_anonymous_integrity_case");
    expect(reporting).toContain("public_reply_anonymous_integrity_case");
    expect(reporting).toContain("reporter_integrity_case");
  });

  it("keeps organizer-only internal notes separate from reporter-visible messages", () => {
    expect(core).toContain("integrity_case_internal_notes");
    expect(core).toContain("visible_to_reporter boolean not null default true");
  });
});

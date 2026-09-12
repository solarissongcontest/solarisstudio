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
const governance = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260910213200_integrity_case_governance.sql",
  ),
  "utf8",
);

describe("integrity findings and rule links", () => {
  it("keeps rule review structured rather than burying it in free text", () => {
    expect(core).toContain("integrity_case_rule_links");
    expect(core).toContain("rule_id text not null");
    expect(core).toContain("'alleged'");
    expect(core).toContain("'supported'");
    expect(core).toContain("'not_supported'");
  });

  it("distinguishes no violation from insufficient evidence", () => {
    expect(core).toContain("'no_violation'");
    expect(core).toContain("'insufficient_evidence'");
    expect(core).toContain("'closed_no_violation'");
    expect(core).toContain("'closed_insufficient_evidence'");
  });

  it("only exposes reporter-visible findings through the reporter snapshot", () => {
    expect(core).toContain("integrity_case_findings f");
    expect(core).toContain("f.visible_to_reporter = true");
  });

  it("revokes direct access to finding and rule-link tables", () => {
    expect(core).toContain(
      "revoke all on public.integrity_case_rule_links from anon, authenticated",
    );
    expect(core).toContain(
      "revoke all on public.integrity_case_findings from anon, authenticated",
    );
  });

  it("records findings through an organizer-only workflow", () => {
    expect(governance).toContain("admin_record_integrity_finding");
    expect(governance).toContain("not_supported");
    expect(governance).toContain("supported");
  });

  it("never adds recovery-secret data to the organizer detail RPC", () => {
    const adminDetailStart = reporting.indexOf(
      "create or replace function public.admin_integrity_case(_case_id uuid)",
    );
    expect(adminDetailStart).toBeGreaterThan(-1);
    const adminDetail = reporting.slice(adminDetailStart);
    expect(adminDetail).not.toContain("recovery_secret_hash");
    expect(adminDetail).not.toContain("recovery_key");
  });
});

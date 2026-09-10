import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260910211600_integrity_findings_and_rule_links.sql",
  ),
  "utf8",
);

describe("integrity findings and rule links", () => {
  it("keeps rule review structured rather than burying it in free text", () => {
    expect(migration).toContain("integrity_case_rule_links");
    expect(migration).toContain("rule_id text not null");
    expect(migration).toContain("'alleged'");
    expect(migration).toContain("'supported'");
    expect(migration).toContain("'not_supported'");
  });

  it("distinguishes no violation from insufficient evidence", () => {
    expect(migration).toContain("'no_violation'");
    expect(migration).toContain("'insufficient_evidence'");
    expect(migration).toContain("'closed_no_violation'");
    expect(migration).toContain("'closed_insufficient_evidence'");
  });

  it("only exposes reporter-visible findings through the anonymous snapshot", () => {
    expect(migration).toContain("integrity_case_findings f");
    expect(migration).toContain("f.visible_to_reporter = true");
  });

  it("revokes direct access to finding and rule-link tables", () => {
    expect(migration).toContain(
      "revoke all on public.integrity_case_rule_links from anon, authenticated",
    );
    expect(migration).toContain(
      "revoke all on public.integrity_case_findings from anon, authenticated",
    );
  });

  it("never adds recovery-secret data to the organizer detail RPC", () => {
    const adminDetailStart = migration.indexOf(
      "create or replace function public.admin_integrity_case(_case_id uuid)",
    );
    expect(adminDetailStart).toBeGreaterThan(-1);
    const adminDetail = migration.slice(adminDetailStart);
    expect(adminDetail).not.toContain("recovery_secret_hash");
    expect(adminDetail).not.toContain("recovery_key");
  });
});

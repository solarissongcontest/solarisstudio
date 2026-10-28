import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261027214501_v3_integrity_adjudication_writer_cutover.sql",
  ),
  "utf8",
);

describe("V3 Integrity adjudication writer cutover", () => {
  it("moves remaining adjudication helpers behind governed commands", () => {
    for (const command of [
      "studio2_integrity_set_case_priority",
      "studio2_integrity_reply_case",
      "studio2_integrity_record_finding",
      "studio2_integrity_record_sanction",
    ]) {
      expect(migration).toContain(`function public.${command}`);
    }
    expect(migration.match(/private\.studio2_claim_operation/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration.match(/private\.studio2_complete_operation/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("p_expected_version");
    expect(migration).toContain("using errcode = '40001'");
  });

  it("removes API and service-role EXECUTE from internal mutation primitives", () => {
    for (const implementation of [
      "admin_set_integrity_priority_impl",
      "admin_reply_integrity_case_impl",
      "admin_record_integrity_finding_impl",
      "admin_record_integrity_sanction_impl",
    ]) {
      expect(migration).toContain(`function public.${implementation}`);
    }
    expect(migration.match(/from public, anon, authenticated, service_role/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("retains legacy RPC shapes only as documented compatibility delegates", () => {
    expect(migration).toContain("TEMPORARY COMPATIBILITY PATH");
    expect(migration).toContain("Sunset:");
    expect(migration).toContain("return public.studio2_integrity_set_case_priority");
    expect(migration).toContain("return public.studio2_integrity_reply_case");
    expect(migration).toContain("return public.studio2_integrity_record_finding");
    expect(migration).toContain("return public.studio2_integrity_record_sanction");
  });

  it("keeps decision rationale inside the authoritative operation fingerprint", () => {
    expect(migration).toContain("'integrity.case.finding'");
    expect(migration).toContain("'integrity.case.sanction'");
    expect(migration).toContain("'rationale', btrim(coalesce(p_rationale, ''))");
    expect(migration).toContain("set_config('app.integrity_rationale'");
  });
});

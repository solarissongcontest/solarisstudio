import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const registry = readFileSync(resolve(process.cwd(), "src/lib/v3-s16-mutation-authority.ts"), "utf8");
const catalogSql = readFileSync(
  resolve(process.cwd(), ".github/scripts/sql/v3-s16-canonical-mutation-authority.sql"),
  "utf8",
);

describe("V3 Integrity S16 authority evidence", () => {
  it("treats adjudication state and immutable history as canonical Integrity tables", () => {
    for (const table of [
      "public.integrity_cases",
      "public.integrity_case_appeals",
      "public.integrity_case_findings",
      "public.integrity_case_sanctions",
      "public.integrity_adjudication_history",
    ]) {
      expect(registry).toContain(`"${table}"`);
      expect(catalogSql).toContain(`'${table.split(".")[1]}'`);
    }
  });

  it("audits event and evidence mutation paths alongside adjudication authority", () => {
    const integrityDomain = registry.slice(registry.indexOf('id: "integrity"'), registry.indexOf('id: "results"'));
    for (const table of ["integrity_case_events", "integrity_case_evidence"]) {
      expect(integrityDomain).toContain(`"public.${table}"`);
      expect(catalogSql).toContain(`('public','${table}')`);
    }
  });

  it("records governed case and appeal commands including participant response paths", () => {
    for (const command of [
      "public.v3_reporter_reply_integrity_case",
      "public.v3_public_reply_anonymous_integrity_case",
      "public.studio2_integrity_case_transition",
      "public.studio2_integrity_record_finding",
      "public.studio2_integrity_record_sanction",
      "public.v3_submit_integrity_appeal",
      "public.v3_public_submit_anonymous_integrity_appeal",
      "public.studio2_integrity_resolve_appeal",
    ]) {
      expect(registry).toContain(`"${command}"`);
    }
  });

  it("collects delegated SECURITY DEFINER authorities without confusing them with physical writers", () => {
    expect(catalogSql).toContain("cardinality(f.writes_tables) > 0 or f.prosecdef");
    expect(catalogSql).toContain("'writesTables', to_jsonb(f.writes_tables)");
    expect(registry).toContain("const writesCritical = (fn.writesTables ?? []).some");
  });
});

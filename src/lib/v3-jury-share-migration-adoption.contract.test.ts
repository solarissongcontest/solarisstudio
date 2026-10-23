import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adoption = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261023180500_v3_jury_share_projection_s13_adoption.sql",
  ),
  "utf8",
);

describe("System V3 Jury Share S13 migration adoption", () => {
  it("registers the pre-framework Jury Share slice through the canonical S13 contract API", () => {
    expect(adoption).toContain("set_config('request.jwt.claim.role', 'service_role', true)");
    expect(adoption).toContain("public.v3_register_migration_contract(");
    expect(adoption).toContain("'v3.jury-share.projection'");
    expect(adoption).toContain("'forward_fix_only'");
    expect(adoption).toContain("false");
    expect(adoption).toContain("Additive Jury Share read projection");
  });

  it("keeps adoption metadata-only and transactional", () => {
    expect(adoption.trimStart().toLowerCase().startsWith("begin;")).toBe(true);
    expect(adoption.toLowerCase()).not.toMatch(/\bcreate\s+table\b/);
    expect(adoption.toLowerCase()).not.toMatch(/\balter\s+table\b/);
    expect(adoption.toLowerCase()).not.toMatch(/\binsert\s+into\b/);
    expect(adoption.toLowerCase()).not.toMatch(/\bupdate\s+public\./);
    expect(adoption.toLowerCase()).not.toMatch(/\bdelete\s+from\b/);
    expect(adoption.trimEnd().toLowerCase().endsWith("commit;")).toBe(true);
  });
});

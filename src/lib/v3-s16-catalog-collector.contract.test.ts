import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const collector = readFileSync("scripts/collect-v3-s16-catalog-evidence.ts", "utf8");
const preflight = readFileSync(".github/workflows/v3-release-candidate-preflight.yml", "utf8");

describe("S16 exact-SHA catalog evidence", () => {
  it("refuses hosted databases and binds evidence to the checked-out candidate", () => {
    expect(collector).toContain("Refusing hosted Supabase S16 catalog inspection");
    expect(collector).toContain('execFileSync("git", ["rev-parse", "HEAD"]');
    expect(collector).toContain("does not match checked-out SHA");
  });

  it("inspects real Postgres authority rather than inferring it from route declarations", () => {
    expect(collector).toContain("information_schema.table_privileges");
    expect(collector).not.toContain("information_schema.role_table_grants");
    expect(collector).toContain("information_schema.column_privileges");
    expect(collector).toContain("'columnDmlGrants'");
    expect(collector).toContain("'role', g.grantee, 'privilege', g.privilege_type, 'column', g.column_name");
    expect(collector).toContain("pg_trigger");
    expect(collector).toContain("aclexplode");
    expect(collector).toContain("pg_get_functiondef");
    expect(collector).toContain("writesTables");
  });

  it("keeps runtime catalog proof inside the explicit exact-SHA release preflight", () => {
    expect(preflight).toContain("Collect exact-SHA S16 catalog evidence");
    expect(preflight).toContain("collect-v3-s16-catalog-evidence.ts");
    expect(preflight).toContain("--catalog=v3-release-preflight/s16/catalog-evidence.json");
    expect(preflight).toContain("supabase db reset --local --no-seed");
    expect(preflight).toContain("supabase stop --no-backup || true");
  });
});

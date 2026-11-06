import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Office -> organ has two FKs after TG2 integrity migration; PostgREST must disambiguate. */
describe("TG3 public offices canonical PostgREST relation", () => {
  it("uses the same-organization composite constraint without changing the verified response alias", () => {
    const migration = readFileSync(resolve(process.cwd(),
      "supabase/migrations/20261104120900_v3_tg2_cross_organization_organ_integrity.sql"), "utf8");
    const reader = readFileSync(resolve(process.cwd(),
      "src/lib/terra-world-bodies-public.ts"), "utf8");

    expect(migration).toMatch(/add constraint world_offices_organ_same_organization_fk\s+foreign key \(organ_id, organization_id\)/);
    expect(reader).toContain("world_organization_organs:world_organization_organs!world_offices_organ_same_organization_fk!inner(id,organization_id,visibility)");
    expect(reader).toContain('.eq("world_organization_organs.visibility", "public")');
    expect(reader).toContain("hasPublicBodyJoin(row, organization.id, body.id)");
  });
});

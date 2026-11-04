import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source(
  "supabase/migrations/20261104120900_v3_tg2_cross_organization_organ_integrity.sql",
);
const foundation = source(
  "supabase/migrations/20261102171500_v3_tg2_world_institution_core.sql",
);
const rollbackFixture = source(
  ".github/scripts/v3-tg2-identity-linkage-privacy-rehearsal.sql",
);

describe("TG2 organ ownership integrity", () => {
  it("builds a composite parent key to require matching institutional identity", () => {
    expect(foundation).toContain("create table public.world_organization_organs");
    expect(foundation).toContain("create table public.world_organization_offices");
    expect(foundation).toContain("create table public.world_capability_grant_scopes");
    expect(migration).toContain("world_organization_organs_id_org_uid");
    expect(migration).toMatch(/unique\s*\(id,\s*organization_id\)/i);
    expect(migration).toContain("'forward_fix_only'");
  });

  it("keeps office and private-grant organ identifiers in the owning organization", () => {
    for (const constraint of [
      "world_offices_organ_same_organization_fk",
      "world_grant_scopes_organ_same_organization_fk",
    ]) {
      expect(migration).toContain("add constraint " + constraint);
    }
    expect(
      migration.match(/foreign key \(organ_id, organization_id\)/g),
    ).toHaveLength(2);
    expect(
      migration.match(/references public\.world_organization_organs\(id, organization_id\)/g),
    ).toHaveLength(2);
    expect(migration.match(/on update restrict on delete restrict/g)).toHaveLength(2);
    expect(migration).not.toMatch(/\bupdate\s+public\.country_accounts\b/i);
  });

  it("enforces foreign-organization denial under rollback-only real PostgreSQL execution", () => {
    expect(rollbackFixture).toContain("TG2_CROSS_ORG_OFFICE_FK_MISSING");
    expect(rollbackFixture).toContain("TG2_CROSS_ORG_GRANT_SCOPE_FK_MISSING");
    expect(rollbackFixture.match(/exception when foreign_key_violation then/g)).toHaveLength(2);
    expect(rollbackFixture).toContain("rollback;");
    expect(rollbackFixture).toContain("v_hidden_organ");
    expect(rollbackFixture).toContain("v_private_org");
  });
});

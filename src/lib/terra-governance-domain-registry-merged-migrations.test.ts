import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TERRA_GOVERNANCE_DOMAIN_REGISTRY,
  TERRA_GOVERNANCE_FOUNDATION_MIGRATIONS,
} from "./terra-governance-domain-registry";

/**
 * This intentionally reads source only. A merged SQL file or registry entry
 * is NOT evidence of deployment, production adoption, or release certification.
 */
describe("WORLD-01 canonical merged TG1/TG2 source migration inventory", () => {
  const filesystemMigrations = readdirSync(resolve(process.cwd(), "supabase/migrations"))
    .filter((name) => /^\d{14}_v3_tg[12]_[a-z0-9_]+\.sql$/.test(name))
    .sort();

  it("enumerates every merged TG1/TG2 migration and nothing from a draft lane", () => {
    expect([...TERRA_GOVERNANCE_FOUNDATION_MIGRATIONS]).toEqual(filesystemMigrations);
    expect(filesystemMigrations.length).toBeGreaterThanOrEqual(12);
    expect(filesystemMigrations).toContain(
      "20261102171950_v3_tg1_current_controller_identity_guard.sql",
    );
    expect(filesystemMigrations).toContain(
      "20261104120900_v3_tg2_cross_organization_organ_integrity.sql",
    );
    expect(filesystemMigrations).toContain(
      "20261104121500_v3_tg2_office_term_effective_authority.sql",
    );
    expect(filesystemMigrations).toContain(
      "20261104121600_v3_tg2_membership_effective_representation.sql",
    );
  });

  it("never duplicates a Supabase migration version inside canonical World foundations", () => {
    const versions = TERRA_GOVERNANCE_FOUNDATION_MIGRATIONS.map((name) => name.slice(0, 14));
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual([...versions].sort());
  });

  it("does not confuse live current country authority with historical World tables", () => {
    const controller = TERRA_GOVERNANCE_DOMAIN_REGISTRY.find(
      (domain) => domain.id === "world-country-control",
    );
    expect(controller?.canonicalOwner).toContain("public.country_accounts for current control");
    expect(controller?.existingSolarisOwnersReused).toContain("public.delegation_people");
    expect(controller?.canonicalTables).toContain("public.world_country_control_terms");

    for (const migration of TERRA_GOVERNANCE_FOUNDATION_MIGRATIONS) {
      expect(migration).not.toContain("_v3_tg3_");
      expect(migration).not.toContain("_v3_tg4_");
      expect(migration).not.toContain("_v3_tg5_");
      expect(migration).not.toContain("_v3_tg6_");
    }
  });
});

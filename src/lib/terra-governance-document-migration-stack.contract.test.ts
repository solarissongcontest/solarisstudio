import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TERRA_GOVERNANCE_FOUNDATION_MIGRATIONS,
  TERRA_GOVERNANCE_TG4_MIGRATIONS,
} from "./terra-governance-domain-registry";

const migrationSource = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");

const versionOf = (name: string) => name.slice(0, 14);

describe("Terra Solaris Governance TG4 migration stack", () => {
  it("keeps TG4 strictly after the exact TG1/TG2 foundation migration set", () => {
    expect(TERRA_GOVERNANCE_FOUNDATION_MIGRATIONS).toEqual([
      "20261102170500_v3_tg1_world_country_control_foundation.sql",
      "20261102171500_v3_tg2_world_institution_core.sql",
      "20261102171600_v3_tg2_world_institution_access.sql",
      "20261102171700_v3_tg2_world_office_term_canonical_alignment.sql",
      "20261102171800_v3_tg2_world_office_term_dependents.sql",
    ]);

    const lastFoundation = versionOf(TERRA_GOVERNANCE_FOUNDATION_MIGRATIONS.at(-1)!);
    for (const migration of TERRA_GOVERNANCE_TG4_MIGRATIONS) {
      expect(versionOf(migration) > lastFoundation).toBe(true);
    }
  });

  it("keeps TG4 migration order deterministic and duplicate-free", () => {
    const versions = TERRA_GOVERNANCE_TG4_MIGRATIONS.map(versionOf);
    expect(versions).toEqual([...versions].sort());
    expect(new Set(versions).size).toBe(versions.length);
    expect(new Set(TERRA_GOVERNANCE_TG4_MIGRATIONS).size).toBe(
      TERRA_GOVERNANCE_TG4_MIGRATIONS.length,
    );
  });

  it("requires every registered TG4 migration to exist in the repository", () => {
    for (const migration of TERRA_GOVERNANCE_TG4_MIGRATIONS) {
      expect(existsSync(resolve(process.cwd(), "supabase/migrations", migration))).toBe(true);
    }
  });

  it("adopts every TG4 migration into the S13 semantic migration ledger immediately", () => {
    const expectedContracts = [
      "v3.tg4.world-document-state",
      "v3.tg4.world-document-commands",
      "v3.tg4.world-document-archive-projection",
      "v3.tg4.world-document-hardening",
      "v3.tg4.world-document-identity-scope",
      "v3.tg4.world-document-hierarchy-integrity",
    ];

    expect(TERRA_GOVERNANCE_TG4_MIGRATIONS).toHaveLength(expectedContracts.length);
    TERRA_GOVERNANCE_TG4_MIGRATIONS.forEach((migration, index) => {
      const sql = migrationSource(migration);
      expect(sql).toContain("public.v3_register_migration_contract");
      expect(sql).toContain(`'${expectedContracts[index]}'`);
      expect(sql).toContain("'forward_fix_only'");
    });
  });

  it("keeps the full TG4 migration wave additive and free of a parallel Archive table", () => {
    const combined = TERRA_GOVERNANCE_TG4_MIGRATIONS.map(migrationSource).join("\n");
    expect(combined).not.toMatch(/drop table\s+public\.world_/i);
    expect(combined).not.toMatch(/create table\s+public\.world_archive/i);
    expect(combined).toContain("private.v3_domain_events");
    expect(combined).toContain("private.v3_domain_event_consumer_receipts");
  });
});

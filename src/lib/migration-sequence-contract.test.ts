import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDir = resolve(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(migrationDir)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

const FEATURE_CHAIN = [
  "20260910213000_integrity_core.sql",
  "20260910213100_integrity_reporting_and_review.sql",
  "20260910213200_integrity_case_governance.sql",
  "20260910213300_integrity_evidence_vault.sql",
  "20260910214000_rulebook_governance.sql",
  "20260910214100_rulebook_release_inheritance.sql",
  "20260910214500_rulebook_release_chain.sql",
  "20260910215000_rulebook_release_validation.sql",
  "20260910215500_rulebook_ancestry_integrity.sql",
  "20260911160000_integrity_sanctions_and_appeals.sql",
  "20260911160100_integrity_reporter_appeals.sql",
  "20260911160200_integrity_appeal_extensions.sql",
  "20260911160300_integrity_appeal_queue.sql",
  "20260911160400_rule_interpretations.sql",
  "20260911160500_integrity_evidence_lifecycle.sql",
  "20260911160600_integrity_evidence_cleanup.sql",
  "20260911160700_integrity_sealed_identity_breakglass.sql",
  "20260911160800_integrity_sealed_identity_expiry.sql",
  "20260911160900_integrity_evidence_interface_hardening.sql",
  "20260911161000_integrity_sealed_identity_state_hardening.sql",
  "20260911161100_integrity_appeal_reviewer_hardening.sql",
  "20260911161200_rule_interpretation_supersession_hardening.sql",
  "20260911161300_rulebook_publication_state_hardening.sql",
] as const;

const FEATURE_MIGRATION_VERSIONS = new Set(FEATURE_CHAIN.map((name) => name.slice(0, 14)));

describe("Supabase migration sequence", () => {
  it("never reuses a migration timestamp inside the Rules + Integrity feature chain", () => {
    expect(FEATURE_MIGRATION_VERSIONS.size).toBe(FEATURE_CHAIN.length);
  });

  it("does not collide with migration versions owned outside Rules + Integrity", () => {
    const externalVersions = new Set(
      migrationFiles
        .filter((name) => !FEATURE_CHAIN.includes(name as (typeof FEATURE_CHAIN)[number]))
        .map((name) => name.slice(0, 14)),
    );
    const collisions = FEATURE_CHAIN.filter((name) => externalVersions.has(name.slice(0, 14)));
    expect(collisions).toEqual([]);
  });

  it("keeps the Rules + Integrity migration chain in dependency order", () => {
    for (const file of FEATURE_CHAIN) {
      expect(migrationFiles, `${file} is missing from supabase/migrations`).toContain(file);
    }

    const positions = FEATURE_CHAIN.map((file) => migrationFiles.indexOf(file));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("wraps every Rules + Integrity migration in an explicit transaction", () => {
    for (const file of FEATURE_CHAIN) {
      const sql = readFileSync(resolve(migrationDir, file), "utf8").trim();
      expect(sql.toLowerCase().startsWith("begin;"), `${file} should start with BEGIN`).toBe(true);
      expect(sql.toLowerCase().endsWith("commit;"), `${file} should end with COMMIT`).toBe(true);
    }
  });

  it("creates core case tables before sanctions, reporter appeals, extensions and organizer queues", () => {
    const corePosition = migrationFiles.indexOf("20260910213000_integrity_core.sql");
    const resolutionPosition = migrationFiles.indexOf("20260911160000_integrity_sanctions_and_appeals.sql");
    const reporterAppealPosition = migrationFiles.indexOf("20260911160100_integrity_reporter_appeals.sql");
    const extensionPosition = migrationFiles.indexOf("20260911160200_integrity_appeal_extensions.sql");
    const queuePosition = migrationFiles.indexOf("20260911160300_integrity_appeal_queue.sql");
    const reviewerHardeningPosition = migrationFiles.indexOf("20260911161100_integrity_appeal_reviewer_hardening.sql");
    expect(corePosition).toBeGreaterThanOrEqual(0);
    expect(resolutionPosition).toBeGreaterThan(corePosition);
    expect(reporterAppealPosition).toBeGreaterThan(resolutionPosition);
    expect(extensionPosition).toBeGreaterThan(reporterAppealPosition);
    expect(queuePosition).toBeGreaterThan(extensionPosition);
    expect(reviewerHardeningPosition).toBeGreaterThan(queuePosition);
  });

  it("creates interpretation governance after the base rulebook architecture exists", () => {
    const rulebookPosition = migrationFiles.indexOf("20260910214000_rulebook_governance.sql");
    const interpretationPosition = migrationFiles.indexOf("20260911160400_rule_interpretations.sql");
    const supersessionHardeningPosition = migrationFiles.indexOf("20260911161200_rule_interpretation_supersession_hardening.sql");
    const publicationHardeningPosition = migrationFiles.indexOf("20260911161300_rulebook_publication_state_hardening.sql");
    expect(rulebookPosition).toBeGreaterThanOrEqual(0);
    expect(interpretationPosition).toBeGreaterThan(rulebookPosition);
    expect(supersessionHardeningPosition).toBeGreaterThan(interpretationPosition);
    expect(publicationHardeningPosition).toBeGreaterThan(rulebookPosition);
  });

  it("adds evidence lifecycle governance only after the private evidence vault exists", () => {
    const vaultPosition = migrationFiles.indexOf("20260910213300_integrity_evidence_vault.sql");
    const lifecyclePosition = migrationFiles.indexOf("20260911160500_integrity_evidence_lifecycle.sql");
    const cleanupPosition = migrationFiles.indexOf("20260911160600_integrity_evidence_cleanup.sql");
    const hardeningPosition = migrationFiles.indexOf("20260911160900_integrity_evidence_interface_hardening.sql");
    expect(vaultPosition).toBeGreaterThanOrEqual(0);
    expect(lifecyclePosition).toBeGreaterThan(vaultPosition);
    expect(cleanupPosition).toBeGreaterThan(lifecyclePosition);
    expect(hardeningPosition).toBeGreaterThan(cleanupPosition);
  });

  it("adds sealed identity break-glass only after protected case governance exists", () => {
    const governancePosition = migrationFiles.indexOf("20260910213200_integrity_case_governance.sql");
    const breakglassPosition = migrationFiles.indexOf("20260911160700_integrity_sealed_identity_breakglass.sql");
    const expiryPosition = migrationFiles.indexOf("20260911160800_integrity_sealed_identity_expiry.sql");
    const stateHardeningPosition = migrationFiles.indexOf("20260911161000_integrity_sealed_identity_state_hardening.sql");
    expect(governancePosition).toBeGreaterThanOrEqual(0);
    expect(breakglassPosition).toBeGreaterThan(governancePosition);
    expect(expiryPosition).toBeGreaterThan(breakglassPosition);
    expect(stateHardeningPosition).toBeGreaterThan(expiryPosition);
  });
});

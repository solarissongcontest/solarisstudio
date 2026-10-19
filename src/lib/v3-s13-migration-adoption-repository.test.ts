import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  V3_S13_FRAMEWORK_MIGRATION,
  V3_S13_FRAMEWORK_VERSION,
  V3_S13_REVIEWED_EXEMPTIONS,
  auditV3S13MigrationAdoption,
  validateV3S13ReviewedExemptions,
} from "./v3-s13-migration-adoption-audit";

const migrationsRoot = resolve(process.cwd(), "supabase/migrations");
const migrationNames = readdirSync(migrationsRoot)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const postFrameworkMigrations = migrationNames
  .filter((name) => {
    const version = name.split("_", 1)[0] ?? "";
    return /^\d{14}$/.test(version) && version > V3_S13_FRAMEWORK_VERSION;
  })
  .map((name) => ({
    path: `supabase/migrations/${name}`,
    source: readFileSync(resolve(migrationsRoot, name), "utf8"),
  }));

describe("System V3 S13 repository migration adoption", () => {
  it("pins the real S13 framework migration boundary", () => {
    expect(migrationNames).toContain(V3_S13_FRAMEWORK_MIGRATION);
  });

  it("keeps reviewed exemptions concrete, owned and evidenced", () => {
    expect(
      validateV3S13ReviewedExemptions(
        postFrameworkMigrations,
        V3_S13_REVIEWED_EXEMPTIONS,
      ),
    ).toEqual([]);
  });

  it("fails closed on unclassified high-risk post-framework migrations", () => {
    const report = auditV3S13MigrationAdoption(
      postFrameworkMigrations,
      V3_S13_REVIEWED_EXEMPTIONS,
    );
    const unsafe = report.findings.filter((finding) => finding.risks.length > 0);

    expect(
      unsafe,
      [
        `${unsafe.length} high-risk post-framework migration(s) lack an S13 contract or reviewed exemption.`,
        ...unsafe.map(
          (finding) =>
            `${finding.path}: ${finding.risks.join(", ") || "unclassified"}`,
        ),
      ].join("\n"),
    ).toEqual([]);
  });
});

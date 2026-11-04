import { describe, expect, it } from "vitest";
import {
  auditV3ProductionMigrationFrontier,
  V3_PRODUCTION_BOOTSTRAP_CUTOVER,
} from "./v3-production-migration-frontier";

const cutover = V3_PRODUCTION_BOOTSTRAP_CUTOVER;
const historicRepo = `${cutover}_historical_repository.sql`;
const historicHosted = { version: "20261001202836", name: "bootstrap_historical_repository" };
const canonical = "20261017100000_canonical.sql";
const migration = (filename: string) => ({
  version: filename.substring(0, 14),
  name: filename.slice(15, -4),
});

describe("V3 hosted production migration frontier", () => {
  it("recognizes the October bootstrap representation without asking to replay history", () => {
    const report = auditV3ProductionMigrationFrontier(
      [historicRepo, canonical, "20261018100000_future.sql"],
      [historicHosted, migration(canonical)],
    );
    expect(report.historicalRepoOnlyCount).toBe(1);
    expect(report.historicalHostedOnlyCount).toBe(1);
    expect(report.holesBeforeHostedHead).toEqual([]);
    expect(report.unknownHostedPostCutover).toEqual([]);
    expect(report.pendingAfterHostedHead.map((item) => item.version)).toEqual(["20261018100000"]);
    expect(report.historyReconciled).toBe(true);
  });

  it("never treats a local-only post-cutover migration below hosted head as bootstrap debt", () => {
    const missing = "20261018100000_required_old.sql";
    const report = auditV3ProductionMigrationFrontier(
      [historicRepo, canonical, missing, "20261103000000_pending.sql"],
      [historicHosted, migration(canonical), { version: "20261101181812", name: "rules" }],
    );
    expect(report.holesBeforeHostedHead.map((item) => item.filename)).toEqual([missing]);
    expect(report.pendingAfterHostedHead).toHaveLength(1);
    expect(report.unknownHostedPostCutover).toHaveLength(1);
    expect(report.historyReconciled).toBe(false);
  });

  it("flags post-cutover hosted hotfixes absent from the repository instead of creating no-op aliases", () => {
    const report = auditV3ProductionMigrationFrontier(
      [historicRepo, canonical],
      [historicHosted, migration(canonical), { version: "20261101172649", name: "v3_confirmation_pending_nf_winner" }],
    );
    expect(report.unknownHostedPostCutover).toEqual([
      { version: "20261101172649", name: "v3_confirmation_pending_nf_winner" },
    ]);
    expect(report.historyReconciled).toBe(false);
  });

  it("rejects a post-cutover name mismatch even when the timestamp matches", () => {
    const report = auditV3ProductionMigrationFrontier(
      [historicRepo, canonical],
      [historicHosted, { version: "20261017100000", name: "different_live_sql" }],
    );
    expect(report.nameMismatches).toEqual([
      { version: "20261017100000", repositoryName: "canonical", hostedName: "different_live_sql" },
    ]);
    expect(report.historyReconciled).toBe(false);
  });

  it("fails closed on duplicates and invalid histories", () => {
    const report = auditV3ProductionMigrationFrontier(
      [historicRepo, canonical, "20261017100000_duplicate.sql", "bad.sql"],
      [historicHosted, migration(canonical), migration(canonical)],
    );
    expect(report.errors.join(" ")).toMatch(/Duplicate repository migration version/);
    expect(report.errors.join(" ")).toMatch(/Duplicate hosted migration version/);
    expect(report.errors.join(" ")).toMatch(/Invalid repository migration filename/);
    expect(report.historyReconciled).toBe(false);
  });

  it("fails closed when remote evidence is missing or too old", () => {
    const noEvidence = auditV3ProductionMigrationFrontier([historicRepo, canonical], []);
    expect(noEvidence.historyReconciled).toBe(false);
    expect(noEvidence.errors).toContain("Hosted migration inventory is empty");

    const staleRemote = auditV3ProductionMigrationFrontier(
      [historicRepo, canonical],
      [historicHosted],
    );
    expect(staleRemote.historyReconciled).toBe(false);
    expect(staleRemote.errors.join(" ")).toMatch(/predates the documented bootstrap cutover/);
  });
});

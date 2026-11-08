import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  auditV3ProductionMigrationFrontier,
  V3_PRODUCTION_BOOTSTRAP_CUTOVER,
} from "./v3-production-migration-frontier";
import {
  buildV3SchemaEffectManifestTemplate,
  reconcileV3ProductionSchemaEffects,
} from "./v3-production-schema-effect-reconciliation";

const sha = "a".repeat(40);
const historic = `${V3_PRODUCTION_BOOTSTRAP_CUTOVER}_historical.sql`;
const hole = "20261017100000_required.sql";
const pending = "20261105000000_pending.sql";
const migration = (filename: string) => ({
  version: filename.slice(0, 14),
  name: filename.slice(15, -4),
});

function frontier() {
  return auditV3ProductionMigrationFrontier(
    [historic, hole, pending],
    [
      { version: "20261001000000", name: "bootstrap" },
      { version: "20261018100000", name: "hosted_head" },
    ],
  );
}

describe("V3 production schema-effect reconciliation", () => {
  it("requires complete one-to-one effect coverage and preserves history", () => {
    const current = frontier();
    const template = buildV3SchemaEffectManifestTemplate(sha, current);
    const manifest = {
      ...template,
      entries: [{
        ...template.entries[0],
        classification: "effect-partial",
        evidenceRefs: ["local-catalog:s14-vote-guard"],
        dependencies: ["s14-source-truth"],
        forwardPlan: "Review a new owner-approved migration sequence",
      }],
    };
    const report = reconcileV3ProductionSchemaEffects({ candidateSha: sha, frontier: current, manifest });
    expect(report.manifestValid).toBe(true);
    expect(report.evidenceComplete).toBe(true);
    expect(report.productionDeploymentAuthorized).toBe(false);
    expect(report.reconciledVersions).toEqual(["20261017100000"]);
  });

  it("rejects omissions, unsafe replay language, and candidate drift", () => {
    const current = frontier();
    const template = buildV3SchemaEffectManifestTemplate(sha, current);
    const manifest = {
      ...template,
      entries: [{
        ...template.entries[0],
        evidenceRefs: ["catalog"],
        dependencies: [],
        forwardPlan: "replay this migration on hosted production",
      }],
    };
    const report = reconcileV3ProductionSchemaEffects({
      candidateSha: "b".repeat(40),
      frontier: current,
      manifest,
    });
    expect(report.manifestValid).toBe(false);
    expect(report.errors.join("\n")).toMatch(/candidateSha|forwardPlan/);
  });


  it("does not call a syntactically valid but uncertain catalog manifest reconciled", () => {
    const current = frontier();
    const template = buildV3SchemaEffectManifestTemplate(sha, current);
    const manifest = {
      ...template,
      entries: [{
        ...template.entries[0],
        classification: "effect-uncertain",
        evidenceRefs: ["read-only-catalog:2026-11-08"],
        forwardPlan: "Review exact hosted object definition before approving forward recovery",
      }],
    };
    const report = reconcileV3ProductionSchemaEffects({ candidateSha: sha, frontier: current, manifest });
    expect(report.manifestValid).toBe(true);
    expect(report.evidenceComplete).toBe(false);
    expect(report.unresolvedVersions).toEqual([migration(hole).version]);
    expect(report.productionDeploymentAuthorized).toBe(false);
  });

  it("rejects unsupported present-effect claims without any evidence reference", () => {
    const current = frontier();
    const template = buildV3SchemaEffectManifestTemplate(sha, current);
    const manifest = {
      ...template,
      entries: [{
        ...template.entries[0],
        classification: "effect-present",
        evidenceRefs: [],
        forwardPlan: null,
      }],
    };
    const report = reconcileV3ProductionSchemaEffects({ candidateSha: sha, frontier: current, manifest });
    expect(report.manifestValid).toBe(false);
    expect(report.evidenceComplete).toBe(false);
    expect(report.errors.join("\n")).toMatch(/non-empty unique evidenceRefs/);
  });

  it("keeps pending newer migrations separate from historical holes", () => {
    const current = frontier();
    const manifest = buildV3SchemaEffectManifestTemplate(sha, current);
    expect(manifest.pendingVersions).toEqual([migration(pending).version]);
    expect(manifest.entries).toHaveLength(1);
  });

  it("does not contain a hosted Supabase connection or production-write path", () => {
    const source = readFileSync("scripts/check-v3-production-schema-effects.ts", "utf8");
    expect(source).not.toMatch(/supabase\.co|SUPABASE_(?:URL|SERVICE_ROLE)|migration (?:up|push)/i);
    expect(source).not.toMatch(/\b(?:fetch|createClient)\s*\(/);
    expect(source).toContain("if (!report.evidenceComplete) process.exit(1)");
  });
});

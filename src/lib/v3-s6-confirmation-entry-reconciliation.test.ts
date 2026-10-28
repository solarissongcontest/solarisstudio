import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const reconciliation = source("src/integrations/confirmations/reconcile.server.ts");
const canonicalSync = source("src/integrations/confirmations/sync.functions.ts");

function functionBody(name: string) {
  const marker = `export async function ${name}`;
  const start = reconciliation.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = reconciliation.indexOf("\nexport async function ", start + marker.length);
  return reconciliation.slice(start, next === -1 ? reconciliation.length : next);
}

describe("System V3 S6 Confirmation -> Entry reconciliation", () => {
  it("reuses the canonical Confirmation sync instead of creating a competing Entry writer", () => {
    const rebuildCore = functionBody("reconcileConfirmationEditionToSolarisWithDependencies");
    const productionWrapper = functionBody("reconcileConfirmationEditionToSolarisInternal");

    expect(rebuildCore).toContain("syncSubmission(row.id)");
    expect(productionWrapper).toContain("syncSubmission: syncConfirmationSubmissionToSolarisInternal");
    expect(rebuildCore).not.toContain('.from("entries").update');
    expect(rebuildCore).not.toContain('.from("entries").upsert');
    expect(rebuildCore).not.toContain('.from("participants").update');
    expect(productionWrapper).not.toContain('.from("entries").update');
    expect(productionWrapper).not.toContain('.from("entries").upsert');
  });

  it("bounds each repair invocation and avoids uncontrolled concurrent service-role fanout", () => {
    const rebuildCore = functionBody("reconcileConfirmationEditionToSolarisWithDependencies");
    expect(reconciliation).toContain("V3_CONFIRMATION_RECONCILIATION_MAX_BATCH = 50");
    expect(rebuildCore).toContain('.eq("edition_id", editionId)');
    expect(rebuildCore).toContain('.order("updated_at", { ascending: true })');
    expect(rebuildCore).toContain('.order("id", { ascending: true })');
    expect(rebuildCore).toContain(".range(offset, offset + limit - 1)");
    expect(rebuildCore).toContain("for (const row of rows)");
    expect(rebuildCore).not.toContain("Promise.all(rows");
    expect(rebuildCore).toContain("nextOffset");
  });

  it("keeps canonical ownership and newer final lifecycle guards in the delegated writer", () => {
    const command = source("supabase/migrations/20261027211501_v3_s16_entry_confirmation_authority.sql");
    const finalGuard = source("supabase/migrations/20261028112937_v3_confirmation_preserve_final_entry_review.sql");
    expect(canonicalSync).toContain('db.rpc("v3_sync_confirmation_entry"');
    expect(canonicalSync).not.toMatch(/\.from\("entries"\)\s*\.(?:update|insert|upsert)/);
    expect(command).toContain("v_existing.source <> 'confirmations'");
    expect(command).toContain("'status', 'canonical_owned'");
    expect(finalGuard).toContain("v_existing.updated_at > v_submission.updated_at");
    expect(finalGuard).toContain("'status','canonical_newer'");
  });

  it("provides an independent read-only edition verifier with an explicit diagnostic ceiling", () => {
    const verifyCore = functionBody("verifyConfirmationEditionProjectionWithDatabase");
    const productionWrapper = functionBody("verifyConfirmationEditionProjectionInternal");

    expect(reconciliation).toContain("V3_CONFIRMATION_RECONCILIATION_VERIFY_MAX_ROWS = 500");
    expect(verifyCore).toContain('state: "unknown"');
    expect(verifyCore).toContain('reason: "verification_bound_exceeded"');
    expect(verifyCore).toContain("latestSubmissionWins");
    expect(verifyCore).toContain('entry.source !== "confirmations"');
    expect(verifyCore).toContain("hasNewerFinalLifecycle");
    expect(verifyCore).toContain('code: "entry_submission_provenance"');
    expect(verifyCore).toContain('code: "participant_status"');
    expect(verifyCore).not.toContain(".update(");
    expect(verifyCore).not.toContain(".upsert(");
    expect(verifyCore).not.toContain(".insert(");
    expect(verifyCore).not.toContain(".delete(");
    expect(productionWrapper).toContain("verifyConfirmationEditionProjectionWithDatabase");
    expect(productionWrapper).not.toContain(".update(");
  });

  it("promotes Entry projections only to rebuildable, not verified", () => {
    const entry = V3_PROJECTION_RECONCILIATION_REGISTRY.filter((projection) =>
      projection.canonicalDomains.includes("entry"),
    );
    expect(entry.length).toBeGreaterThan(0);
    expect(entry.every((projection) => projection.repair.state === "rebuildable")).toBe(true);
    expect(entry.every((projection) => projection.repair.scope === "edition")).toBe(true);
    expect(entry.every((projection) => projection.repair.evidence.length >= 3)).toBe(true);
    expect(entry.some((projection) => projection.repair.state === "verified")).toBe(false);
  });
});

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
    const rebuild = functionBody("reconcileConfirmationEditionToSolarisInternal");
    expect(rebuild).toContain("syncConfirmationSubmissionToSolarisInternal(row.id)");
    expect(rebuild).not.toContain('.from("entries").update');
    expect(rebuild).not.toContain('.from("entries").upsert');
    expect(rebuild).not.toContain('.from("participants").update');
  });

  it("bounds each repair invocation and avoids uncontrolled concurrent service-role fanout", () => {
    const rebuild = functionBody("reconcileConfirmationEditionToSolarisInternal");
    expect(reconciliation).toContain("V3_CONFIRMATION_RECONCILIATION_MAX_BATCH = 50");
    expect(rebuild).toContain('.eq("edition_id", editionId)');
    expect(rebuild).toContain('.order("updated_at", { ascending: true })');
    expect(rebuild).toContain('.order("id", { ascending: true })');
    expect(rebuild).toContain(".range(offset, offset + limit - 1)");
    expect(rebuild).toContain("for (const row of rows)");
    expect(rebuild).not.toContain("Promise.all(rows");
    expect(rebuild).toContain("nextOffset");
  });

  it("keeps canonical ownership and newer final lifecycle guards in the delegated writer", () => {
    expect(canonicalSync).toContain('canonicalGuard.data.source !== "confirmations"');
    expect(canonicalSync).toContain('status: "canonical_owned"');
    expect(canonicalSync).toContain("canonicalUpdatedAt > snapshotUpdatedAt");
    expect(canonicalSync).toContain('status: "canonical_newer"');
  });

  it("provides an independent read-only edition verifier with an explicit diagnostic ceiling", () => {
    const verify = functionBody("verifyConfirmationEditionProjectionInternal");
    expect(reconciliation).toContain("V3_CONFIRMATION_RECONCILIATION_VERIFY_MAX_ROWS = 500");
    expect(verify).toContain('state: "unknown"');
    expect(verify).toContain('reason: "verification_bound_exceeded"');
    expect(verify).toContain("latestSubmissionWins");
    expect(verify).toContain('entry.source !== "confirmations"');
    expect(verify).toContain("hasNewerFinalLifecycle");
    expect(verify).toContain('code: "entry_submission_provenance"');
    expect(verify).toContain('code: "participant_status"');
    expect(verify).not.toContain(".update(");
    expect(verify).not.toContain(".upsert(");
    expect(verify).not.toContain(".insert(");
    expect(verify).not.toContain(".delete(");
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

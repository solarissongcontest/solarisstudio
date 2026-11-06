import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const syncRoute = readFileSync("src/routes/confirmations/admin/sync.tsx", "utf8");
const lineupRoute = readFileSync("src/routes/_authenticated/admin/lineup-sync/$slug.tsx", "utf8");
const lineupServer = readFileSync("src/lib/admin-lineup.functions.ts", "utf8");

describe("V3 Organizer Confirmation line-up sync", () => {
  it("requires the exact Organizer edition instead of selecting a global/newest round", () => {
    expect(syncRoute).toContain("useAdminContext()");
    expect(syncRoute).toContain("editionId: organizerEditionId");
    expect(syncRoute).toContain("if (!organizerEditionId)");
    expect(syncRoute).toContain("row.editions?.id === organizerEditionId");
    expect(syncRoute).toContain("row.editions.id !== organizerEditionId");
    expect(syncRoute).not.toContain("b.editionNumber - a.editionNumber");
    expect(syncRoute).toContain('title="Select an edition"');
    expect(syncRoute).toContain("will not choose the newest confirmation round or another edition automatically");
  });

  it("rejects stale edition targets before applying the reviewed line-up sync", () => {
    expect(syncRoute).toContain("result.editionId !== organizerEditionId");
    expect(syncRoute).toContain("selectedRound.editionId !== organizerEditionId");
    expect(syncRoute).toContain("targets.editionId !== organizerEditionId");
    expect(syncRoute).toContain("Edition context changed before the line-up review");
    expect(syncRoute).toContain("organizerEditionIdRef.current !== review.editionId");
    expect(syncRoute).toContain("liveTargets.editionId !== review.editionId");
    expect(syncRoute).toContain("The Solaris target edition no longer matches this review");
  });

  it("routes show membership through System #598 governed command authority", () => {
    expect(syncRoute).toContain("addCountriesToShow");
    expect(lineupServer).toContain("export const addCountriesToShow");
    expect(lineupServer).toContain("requireSolarisOrganizerServer()");
    expect(lineupServer).toContain("createSolarisAuthenticatedClientServer()");
    expect(lineupServer).toContain('rpc("v3_show_lineup_preflight"');
    expect(lineupServer).toContain('rpc("v3_execute_show_lineup_operation"');
    expect(lineupServer).toContain('p_action: "sync_confirmed_countries"');
    expect(lineupServer).toContain("p_expected_state_version: preflight.stateVersion");
    expect(lineupServer).not.toContain('.from("participants").update');
    expect(lineupServer).not.toContain('.from("participants").insert');
  });

  it("reconciles a known operation before computing a fresh preflight", () => {
    const reconcileIndex = lineupServer.indexOf('rpc("studio2_reconcile_operation"');
    const preflightIndex = lineupServer.indexOf('rpc("v3_show_lineup_preflight"');
    expect(reconcileIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeGreaterThan(reconcileIndex);
    expect(lineupServer).toContain('reconciliation.error.code !== "P0002"');
    expect(lineupServer).toContain('envelope.status === "succeeded"');
  });

  it("keeps one operation identity across ambiguous retries on both Organizer entry points", () => {
    expect(syncRoute).toContain("operationId: crypto.randomUUID()");
    expect(syncRoute).toContain("operationId: review.operationId");
    expect(syncRoute).toContain("idempotencyKey: `show-lineup-sync:${review.operationId}`");
    expect(syncRoute).toContain("ambiguous failure");
    expect(syncRoute).not.toContain("System #598 remains the blocker");

    expect(lineupRoute).toContain("operationIdsRef");
    expect(lineupRoute).toContain("operationIdsRef.current.get(key) ?? crypto.randomUUID()");
    expect(lineupRoute).toContain("operationId,");
    expect(lineupRoute).toContain("idempotencyKey: `show-lineup-sync:${operationId}`");
    expect(lineupRoute).toContain("operationIdsRef.current.delete(key)");
  });
});

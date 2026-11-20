import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/time-machine.tsx", "utf8");
const registry = readFileSync("src/lib/v3-organizer-capability-registry.ts", "utf8");

describe("V3 Organizer Time Machine", () => {
  it("fails closed without an exact Organizer edition and scopes rollout to that edition", () => {
    expect(route).toContain("const { editionId } = useAdminContext()");
    expect(route).toContain("enabled: Boolean(editionId)");
    expect(route).toContain('["studio2-feature", "time_machine", editionId ?? "none"]');
    expect(route).toContain('isStudio2FeatureEnabled("time_machine", editionId)');
    expect(route).toContain("Select an edition");
    expect(route).not.toContain('editionId ?? "all"');
  });

  it("validates exact edition and historical instant before accepting RPC evidence", () => {
    expect(route).toContain("validateSnapshotScope(data, editionId, asOf)");
    expect(route).toContain("snapshot.edition?.id !== editionId");
    expect(route).toContain("Date.parse(requestedAsOf)");
    expect(route).toContain('Date.parse(snapshot.asOf ?? "")');
    expect(route).toContain("returnedAt !== requestedAt");
    expect(route).toContain("Time Machine evidence did not match the selected Organizer edition");
    expect(route).toContain("Time Machine evidence did not match the requested historical instant");
    expect(route).toContain("Array.isArray(snapshot.events)");
    expect(route).toContain("Array.isArray(snapshot.audit)");
  });

  it("compares two scope-validated authoritative snapshots through the same read-only RPC", () => {
    expect(route).toContain('rpc("studio2_time_machine"');
    expect(route).toContain("comparisonSnapshot");
    expect(route).toContain("compareAsOf");
    expect(route).toContain("Compare snapshots");
    expect(route).toContain("Recorded changes between snapshots");
    expect(route).toContain("firstIds.has(row.id)");
    expect(route.match(/loadSnapshot\(editionId!,/g)?.length).toBe(2);
  });

  it("keeps comparison evidence-only and explicit about incomplete history", () => {
    expect(route).toContain("recorded events and audit markers introduced between the two timestamps");
    expect(route).toContain("The diff contains recorded changes only");
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".delete(");
  });

  it("keeps the protected historical surface out of crawler discovery", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
  });

  it("records Time Machine as building without claiming historical completeness", () => {
    expect(registry).toContain('id === "live-review-time-machine"');
  });
});

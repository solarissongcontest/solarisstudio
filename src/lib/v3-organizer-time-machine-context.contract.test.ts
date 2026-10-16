import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/time-machine.tsx", "utf8");

describe("V3 Organizer Time Machine", () => {
  it("fails closed without an exact Organizer edition", () => {
    expect(route).toContain("const { editionId } = useAdminContext()");
    expect(route).toContain("Boolean(editionId)");
    expect(route).toContain('editionId ?? "none"');
    expect(route).toContain("Select an edition");
    expect(route).not.toContain('editionId ?? "all"');
  });

  it("compares two authoritative snapshots through the same read-only RPC", () => {
    expect(route).toContain('rpc("studio2_time_machine"');
    expect(route).toContain("comparisonSnapshot");
    expect(route).toContain("compareAsOf");
    expect(route).toContain("Compare snapshots");
    expect(route).toContain("Recorded changes between snapshots");
    expect(route).toContain("firstIds.has(row.id)");
  });

  it("keeps comparison evidence-only and explicit about incomplete history", () => {
    expect(route).toContain("recorded events and audit markers introduced between the two timestamps");
    expect(route).toContain("The diff contains recorded changes only");
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".delete(");
  });
});

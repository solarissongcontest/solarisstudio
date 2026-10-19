import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/hod-history.tsx"),
  "utf8",
);

describe("V3 Organizer HOD historical-assignment removal", () => {
  it("freezes the exact assignment in review instead of deleting by stale row id", () => {
    expect(route).toContain("const [removeTarget, setRemoveTarget] = useState<Assignment | null>(null)");
    expect(route).toContain("setRemoveTarget(assignment)");
    expect(route).toContain("removeAssignment.mutate(removeTarget)");
    expect(route).not.toContain("removeAssignment.mutate(removeTarget.id)");
    expect(route).toContain("data-v3-organizer-hod-removal-review");
  });

  it("re-reads authoritative HOD history immediately before deletion", () => {
    expect(route).toContain("mutationFn: async (review: Assignment) =>");
    expect(route).toContain("const live = await getHistory()");
    expect(route).toContain("assignment.id === review.id");
    expect(route).toContain("assignmentFingerprint(liveAssignment) !== assignmentFingerprint(review)");
    expect(route).toContain("HOD assignment changed while this removal review was open");
    expect(route).toContain("Nothing was removed");
  });

  it("requires typed delegation confirmation and repeats exact historical context", () => {
    expect(route).toContain('confirmLabel="Remove reviewed assignment"');
    expect(route).toContain("confirmationText={removeTarget?.countryCode}");
    expect(route).toContain("Type ${removeTarget.countryCode} to confirm permanent historical assignment removal");
    expect(route).toContain("removeTarget.editionName");
    expect(route).toContain("removeTarget.personName");
    expect(route).toContain("removeTarget.identityKey");
    expect(route).toContain("removeTarget.source");
    expect(route).toContain("removeTarget.confidence");
  });

  it("keeps legacy authority limitations explicit", () => {
    expect(route).toContain("does not alter ballots, votes or official contest results");
    expect(route).toContain("not a versioned/idempotent V3 operation");
    expect(route).toContain("System #1071 owns canonical HOD mutation authority and receipts");
  });
});

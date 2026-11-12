import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveConfirmationNationalFinalTriage as triage } from "./confirmation-national-final-triage";

const accepted = { id: "entry-a", review_status: "accepted" };
const acceptedB = { id: "entry-b", review_status: "accepted" };

describe("Organizer National Final readiness", () => {
  it("only marks accepted, active, selected winners as ready", () => {
    expect(triage([accepted, acceptedB], "entry-a", false)).toBe("ready");
    expect(triage([accepted], "stale-id", false)).toBe("issue");
    expect(triage([accepted], null, false)).toBe("neutral");
  });

  it("cannot use a removed or superseded winner to claim readiness", () => {
    expect(triage([{ ...accepted, removed: true }, acceptedB], "entry-a", false)).toBe("issue");
    expect(triage([{ ...accepted, review_status: "removed" }, acceptedB], "entry-a", false)).toBe("issue");
    expect(triage([{ ...accepted, removed: true }], "entry-a", false)).toBe("neutral");
  });

  it("prioritizes declined entries and review work over a selected winner", () => {
    expect(triage([accepted, { id: "entry-c", review_status: "declined" }], "entry-a", false)).toBe("issue");
    expect(triage([accepted, { id: "entry-c", review_status: "pending" }], "entry-a", false)).toBe("review");
    expect(triage([accepted, { id: "entry-c", review_status: null }], "entry-a", false)).toBe("review");
    expect(triage([accepted, { id: "entry-c", review_status: "submitted" }], "entry-a", false)).toBe("review");
  });

  it("never claims ready from unknown or empty evidence", () => {
    expect(triage([accepted], "entry-a", true)).toBe("neutral");
    expect(triage([], "entry-a", false)).toBe("neutral");
  });

  it("is consumed by canonical Delegations Overview rather than parallel client ranking", () => {
    const route = readFileSync("src/routes/confirmations/admin/index.tsx", "utf8");
    expect(route).toContain("deriveConfirmationNationalFinalTriage(");
    expect(route).not.toContain("const entries = activeNfEntries(row);");
    expect(route).not.toContain('if (!row.national_finals?.winning_entry_id) return "neutral";');
  });
});

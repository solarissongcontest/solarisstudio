import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeOrganizerEntryDetail } from "./v3-organizer-entry-detail-summary";

const accepted = (id = "entry-1", version = "v2") => ({
  id, review_status: "accepted", current_version_id: version,
  reviewed_version_id: version,
});
const stale = (id = "entry-2") => ({
  ...accepted(id), reviewed_version_id: "v1",
});

describe("Organizer Entry Review detail summary", () => {
  it("counts only current-version accepted entries", () => {
    expect(summarizeOrganizerEntryDetail({
      internalEntry: accepted(),
      nationalFinal: { entries: [accepted("entry-2"), stale("entry-3")], winning_entry_id: "entry-2" },
    })).toMatchObject({ entryCount: 3, currentAcceptedCount: 2 });
  });

  it("never marks a stale-version National Final ready, even with a stored winner", () => {
    const result = summarizeOrganizerEntryDetail({
      nationalFinal: { entries: [accepted(), stale()], winning_entry_id: "entry-1" },
    });
    expect(result.nationalFinal).toMatchObject({
      label: "Winner selected · review incomplete", tone: "attention",
    });
    expect(result.currentAcceptedCount).toBe(1);
  });

  it("rejects a missing or removed stored winner from ready display", () => {
    for (const entries of [
      [accepted()],
      [accepted(), { ...accepted("winner"), removed: true }],
    ]) {
      const result = summarizeOrganizerEntryDetail({
        nationalFinal: { entries, winning_entry_id: "winner" },
      });
      expect(result.nationalFinal).toMatchObject({
        label: "Winner needs review", tone: "attention",
      });
    }
  });

  it("requires a winner and accepted exact versions for a ready National Final", () => {
    const entries = [accepted(), accepted("entry-2")];
    expect(summarizeOrganizerEntryDetail({
      nationalFinal: { entries, winning_entry_id: null },
    }).nationalFinal).toMatchObject({
      label: "Waiting for winner", tone: "neutral",
    });
    expect(summarizeOrganizerEntryDetail({
      nationalFinal: { entries, winning_entry_id: "entry-2" },
    }).nationalFinal).toMatchObject({
      label: "Winner set", tone: "ready",
    });
  });

  it("does not count removed or unbound legacy decisions as accepted", () => {
    expect(summarizeOrganizerEntryDetail({
      internalEntry: { ...accepted(), removed: true },
      nationalFinal: {
        entries: [
          { ...accepted("entry-2"), current_version_id: null },
          { ...accepted("entry-3"), reviewed_version_id: null },
          { ...accepted("entry-4"), review_status: "removed" },
        ],
      },
    })).toMatchObject({ entryCount: 2, currentAcceptedCount: 0 });
  });

  it("reports an empty NF as needing attention rather than a chosen winner", () => {
    expect(summarizeOrganizerEntryDetail({
      nationalFinal: { entries: [], winning_entry_id: "stale-id" },
    }).nationalFinal).toMatchObject({
      label: "No active entries", tone: "attention",
    });
  });

  it("keeps the dashboard summary on the same current-version interpretation", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/confirmations/admin/responses/$id.tsx"), "utf8");
    expect(route).toContain("summarizeOrganizerEntryDetail({");
    expect(route).toContain("const acceptedCount = entrySummary.currentAcceptedCount;");
    expect(route).toContain("entrySummary.nationalFinal?.label");
    expect(route).toContain("entrySummary.nationalFinal?.description");
    expect(route).not.toContain('entry.review_status === "accepted"),');
    expect(route).not.toContain('activeNfEntries.every((entry) => entry.review_status === "accepted")');
  });
});

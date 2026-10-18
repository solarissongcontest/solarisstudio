import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/televoting/admin/rounds/$id/entries.tsx");
const adapter = source("src/integrations/televoting/entries.functions.ts");

describe("V3 Organizer voting round mutation reviews", () => {
  it("routes destructive custom-entry deletion through an exact typed review", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("deleteTarget");
    expect(route).toContain("setDeleteTarget(entry)");
    expect(route).toContain("confirmationText={deleteTarget ? displayName(deleteTarget) : undefined}");
    expect(route).not.toMatch(/\bconfirm\s*\(/);
  });

  it("repeats the round and stable custom-entry context before deletion", () => {
    expect(route).toContain('data?.round.name ?? "this round"');
    expect(route).toContain("deleteTarget.entry_key");
    expect(route).toContain("The round must still be");
    expect(route).toContain('deleteTarget?.entry_type !== "custom"');
  });

  it("reviews self-voting changes instead of mutating directly from the select", () => {
    expect(route).toContain("pendingSelfVotingMode");
    expect(route).toContain("Review self-voting rule change");
    expect(route).toContain("selfVotingModeLabel(currentSelfVotingMode)");
    expect(route).toContain("selfVotingModeLabel(pendingSelfVotingMode)");
    expect(route).toContain("confirmSelfVotingModeChange");
    expect(route).not.toContain("onChange={async (event) =>");
  });

  it("requires extra confirmation before enabling unrestricted self-voting", () => {
    expect(route).toContain('pendingSelfVotingMode === "unrestricted"');
    expect(route).toContain("Unrestricted mode removes the self-voting restriction");
    expect(route).toContain('confirmationText={pendingSelfVotingMode === "unrestricted" ? data?.round.name : undefined}');
  });

  it("keeps existing server functions as the only mutation paths and clears stale round context", () => {
    expect(route).toContain("useServerFn(deleteMergedCustomRoundEntry)");
    expect(route).toContain("useServerFn(setMergedRoundSelfVotingMode)");
    expect(route).toContain("await deleteCustom({ data: { roundId, entryId: deleteTarget.id } })");
    expect(route).toContain("await setSelfVoting({ data: { roundId, mode: pendingSelfVotingMode } })");
    expect(route).toContain("setDeleteTarget(null)");
    expect(route).toContain("setPendingSelfVotingMode(null)");
    expect(route).toContain("}, [roundId]);");
    expect(adapter).toContain("deleteMergedCustomRoundEntry");
    expect(adapter).toContain("setMergedRoundSelfVotingMode");
    expect(route.match(/await deleteCustom\(/g)?.length).toBe(1);
    expect(route.match(/await setSelfVoting\(/g)?.length).toBe(1);
  });
});

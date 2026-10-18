import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const route = source("src/routes/televoting/admin/rounds/$id/entries.tsx");
const adapter = source("src/integrations/televoting/entries.functions.ts");

describe("V3 Organizer voting custom-entry deletion review", () => {
  it("routes destructive deletion through an exact typed review instead of browser confirm", () => {
    expect(route).toContain("AdminConfirmSheet");
    expect(route).toContain("deleteTarget");
    expect(route).toContain("setDeleteTarget(entry)");
    expect(route).toContain("confirmationText={deleteTarget ? displayName(deleteTarget) : undefined}");
    expect(route).not.toMatch(/\bconfirm\s*\(/);
  });

  it("repeats the round and stable entry context before apply", () => {
    expect(route).toContain('data?.round.name ?? "this round"');
    expect(route).toContain("deleteTarget.entry_key");
    expect(route).toContain("The round must still be");
    expect(route).toContain('deleteTarget?.entry_type !== "custom"');
  });

  it("keeps the existing server function as the single mutation path and clears stale review context", () => {
    expect(route).toContain("useServerFn(deleteMergedCustomRoundEntry)");
    expect(route).toContain("await deleteCustom({ data: { roundId, entryId: deleteTarget.id } })");
    expect(route).toContain("setDeleteTarget(null)");
    expect(route).toContain("}, [roundId]);");
    expect(adapter).toContain("deleteMergedCustomRoundEntry");
    expect(route.match(/await deleteCustom\(/g)?.length).toBe(1);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const syncSource = source("src/lib/admin-lineup.functions.ts");
const workspace = source("src/components/admin/ShowLineupWorkspace.tsx");
const publicShow = source("src/routes/shows/$showId.tsx");
const migration = source("supabase/migrations/20260821193132_show_lineup_lifecycle.sql");

describe("show line-up lifecycle", () => {
  it("never invents a running order when syncing confirmed countries", () => {
    expect(syncSource).toContain("running_order: null");
    expect(syncSource).toContain("running_order_allocation: null");
    expect(syncSource).not.toContain("let nextOrder");
  });

  it("models line-up, allocation draw and running order as separate stages", () => {
    expect(migration).toContain("'lineup', 'allocation', 'running_order'");
    expect(migration).toContain("running_order_allocation");
    expect(workspace).toContain('type LineupStage = "lineup" | "allocation" | "running_order"');
    expect(workspace).toContain('first_half: "First half"');
    expect(workspace).toContain('second_half: "Second half"');
    expect(workspace).toContain('producer_choice: "Producer choice"');
  });

  it("keeps pre-order stages alphabetical and position-free", () => {
    expect(workspace).toContain("stage === \"running_order\" ? runningParticipants : alphaParticipants");
    expect(workspace).toContain("Position numbers are intentionally hidden.");
    expect(workspace).toContain("No running order exists yet.");
  });

  it("requires allocation completion before running order starts", () => {
    expect(workspace).toContain("const allocationComplete = lifecycleParticipants.length > 0 && allocatedCount === lifecycleParticipants.length");
    expect(workspace).toContain("if (!activeShow || !allocationComplete) return");
    expect(workspace).toContain('await setStage("running_order")');
  });

  it("does not imply a public running order before it is published", () => {
    expect(publicShow).toContain("publicLineupParticipants");
    expect(publicShow).toContain("publication.running_order");
    expect(publicShow).toContain("Alphabetical line-up");
    expect(publicShow).not.toContain("publication.running_order ? p.running_order ?? index + 1 : index + 1");
  });
});

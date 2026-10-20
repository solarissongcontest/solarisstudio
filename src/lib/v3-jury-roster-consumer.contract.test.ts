import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const route = source("src/routes/_authenticated/admin/jury/$slug.tsx");
const client = source("src/lib/v3-jury-roster-client.ts");

describe("V3 Organizer Jury roster authority", () => {
  it("keeps roster writes out of the browser table path", () => {
    expect(route).not.toContain('.from("voters")');
    expect(route).not.toContain(".from('voters')");
    expect(route).toContain("loadJuryRosterPreview");
    expect(route).toContain("applyJuryRosterChange");
  });

  it("routes every roster mutation kind through the governed command", () => {
    for (const changeKind of ["materialize", "add", "update", "reorder", "remove"]) {
      expect(route).toContain(`changeKind: \"${changeKind}\"`);
    }
    expect(route).toContain("payload: { voterIds: canonicalIds }");
    expect(route).toContain("expectedVersion: preview.expectedVersion");
  });

  it("preflights destructive removal and preserves official evidence", () => {
    expect(route).toContain("canonicalVoter.dependencies");
    expect(route).toContain("canonicalVoter.canRemove");
    expect(route).toContain("Official evidence exists:");
    expect(route).toContain("rosterReason.trim().length < 3");
    expect(route).not.toContain("permanently deletes those rows");
  });

  it("uses one authoritative RPC family and reconciles transport uncertainty", () => {
    expect(client).toContain('.rpc("studio2_jury_roster_preview"');
    expect(client).toContain('.rpc("studio2_apply_jury_roster_change"');
    expect(client).toContain('.rpc("studio2_reconcile_operation"');
    expect(client).toContain("never blindly issue the mutation again");
    expect(client.match(/studio2_apply_jury_roster_change/g)?.length).toBe(1);
  });

  it("treats removal as R3 while keeping non-destructive roster changes R2", () => {
    expect(client).toContain('input.changeKind === "remove" ? "R3" : "R2"');
    expect(client).toContain("A removal reason is required.");
  });
});

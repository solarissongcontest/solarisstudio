import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/fantasy.tsx"),
  "utf8",
);

describe("Organizer Fantasy read egress contract", () => {
  it("reads only the Fantasy game fields consumed by the workspace", () => {
    expect(route).toContain('.from("fantasy_games")');
    expect(route).toContain(
      '.select("id,edition_id,show_id,name,opens_at,locks_at,status,roster_size,budget,captain_multiplier")',
    );
    expect(route).not.toContain('.select("*")');
    expect(route).toContain('.eq("edition_id", editionId!)');
    expect(route).toContain('.order("created_at", { ascending: false })');
    expect(route).toContain(".limit(1)");
    expect(route).toContain(".maybeSingle()");
  });

  it("keeps entry-cost reads narrow and bound to the loaded game", () => {
    expect(route).toContain('.from("fantasy_game_entries")');
    expect(route).toContain('.select("country_id,cost,eligible")');
    expect(route).toContain('.eq("game_id", existing.data.id)');
  });

  it("does not add background polling or realtime fan-out to the workspace", () => {
    expect(route).not.toContain("refetchInterval");
    expect(route).not.toContain(".channel(");
    expect(route).not.toContain("postgres_changes");
  });

  it("keeps the authenticated Organizer surface out of crawler traversal", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
  });

  it("preserves exact-edition scope checks around the existing mutation boundaries", () => {
    expect(route).toContain("function assertExactScope()");
    expect(route).toContain("selectedShow.edition_id !== editionId");
    expect(route).toContain("existing.data.edition_id !== editionId");
    expect(route.match(/assertExactScope\(\);/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

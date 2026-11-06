import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildV3OrganizerControlGroups } from "./v3-organizer";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/$slug.tsx"),
  "utf8",
);

describe("V3 Organizer Contest workspace convergence", () => {
  it("keeps one canonical Contest workspace inventory", () => {
    const contest = buildV3OrganizerControlGroups("ssc-22").find((group) => group.key === "contest");

    expect(contest).toBeDefined();
    expect(contest?.items.map((item) => item.key)).toEqual([
      "entry-review",
      "media",
      "shows",
      "running-order",
      "participants",
      "progression",
      "eligibility",
    ]);
    expect(contest?.items.every((item) => item.href)).toBe(true);
  });

  it("renders the Contest overview from that canonical inventory instead of a second hand-written subset", () => {
    expect(route).toContain('import { buildV3OrganizerControlGroups } from "@/lib/v3-organizer"');
    expect(route).toContain('buildV3OrganizerControlGroups(slug).find((group) => group.key === "contest")');
    expect(route).toContain("contestWorkspace?.items.map");
    expect(route).not.toContain('title="Sync confirmed countries"');
    expect(route).not.toContain('title="Entries & running order"');
  });

  it("does not add another Contest data fan-out or mutation authority", () => {
    expect(route.match(/useShows\(/g)).toHaveLength(1);
    expect(route.match(/useParticipants\(/g)).toHaveLength(1);
    expect(route).not.toContain("supabase.from(");
    expect(route).not.toContain("supabase.rpc(");
    expect(route).toContain("This overview only routes you to them; it does not recreate their state or mutation logic.");
  });

  it("keeps edition-scoped Contest destinations exact", () => {
    const contest = buildV3OrganizerControlGroups("ssc-22").find((group) => group.key === "contest");
    const byKey = new Map(contest?.items.map((item) => [item.key, item.href]));

    expect(byKey.get("entry-review")).toBe("/confirmations/admin/responses");
    expect(byKey.get("shows")).toBe("/admin/shows/ssc-22");
    expect(byKey.get("running-order")).toBe("/admin/entries/ssc-22");
    expect(byKey.get("participants")).toBe("/admin/participant-status/ssc-22");
    expect(byKey.get("progression")).toBe("/admin/lineup-sync/ssc-22");
    expect(byKey.get("eligibility")).toBe("/admin/eligibility");
  });
});

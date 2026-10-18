import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/control-room.tsx", "utf8");
const panel = readFileSync("src/components/admin/ControlRoomImmediateAttention.tsx", "utf8");

describe("V3 Organizer Control Room exception-first boundary", () => {
  it("loads shows only for the explicit Organizer edition", () => {
    expect(route).toContain("useShows(editionId || undefined)");
    expect(route).not.toContain("useAllShows");
  });

  it("surfaces immediate attention before lifecycle command controls", () => {
    const attentionIndex = route.indexOf("<ControlRoomImmediateAttention");
    const commandIndex = route.indexOf('eyebrow="Edition command"');

    expect(attentionIndex).toBeGreaterThan(0);
    expect(commandIndex).toBeGreaterThan(attentionIndex);
  });

  it("keeps the attention summary read-only instead of duplicating command authority", () => {
    expect(panel).toContain("this summary does not create a second mutation path");
    expect(panel).not.toContain("useMutation");
    expect(panel).not.toContain("studio2ControlRoom.transitionEdition");
    expect(panel).not.toContain("studio2ControlRoom.transitionIncident");
  });

  it("fails visibly when readiness evidence is unavailable", () => {
    expect(panel).toContain("Readiness evidence is unavailable");
    expect(panel).toContain("cannot claim the edition is clear");
  });
});

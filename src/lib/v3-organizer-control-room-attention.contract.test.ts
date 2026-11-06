import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/control-room.tsx", "utf8");
const panel = readFileSync("src/components/admin/ControlRoomImmediateAttention.tsx", "utf8");

describe("V3 Organizer Control Room exception-first boundary", () => {
  it("loads shows only for the explicit Organizer edition", () => {
    expect(route).toContain("useShows(editionId || undefined)");
    expect(route).not.toContain("useAllShows");
  });

  it("does not turn an unresolved shows query into a no-shows readiness blocker", () => {
    expect(route).toContain("const showsQuery = useShows(editionId || undefined)");
    expect(route).toContain("selectedEdition && readinessDataQuery.data && showsQuery.data");
    expect(route).toContain("readinessLoading={readinessDataQuery.isLoading || showsQuery.isLoading}");
    expect(route).toContain("readinessError={readinessDataQuery.error ?? showsQuery.error}");
  });

  it("binds every reviewed operation to its exact Organizer edition before mutation", () => {
    expect(route.match(/editionId: snapshot\.editionId,/g)).toHaveLength(3);
    expect(route).toContain("if (!snapshot || !editionId || snapshot.editionId !== editionId) return;");
    expect(route).toContain("controlRoomReviewMatchesEdition(");
    expect(route).toContain("pendingReview.editionId,");
    expect(route).toContain("snapshot.editionId,");
    expect(route.indexOf("controlRoomReviewMatchesEdition(")).toBeLessThan(
      route.indexOf("if (pendingReview.kind === 'edition-transition')"),
    );
    expect(route).toContain("Organizer edition context changed after this review opened");
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

  it("fails visibly when readiness evidence is unavailable and never renders a false all-clear", () => {
    expect(panel).toContain("Readiness evidence is unavailable");
    expect(panel).toContain("cannot claim the edition is clear");
    expect(panel).toContain("const clear = !readinessUnavailable && !readinessPending && readiness !== null && items.length === 0");
    expect(panel).toContain('<AdminStatus tone="attention">Unavailable</AdminStatus>');
  });
});

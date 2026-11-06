import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { newOrganizerEntryFollowupTemplate } from "./v3-organizer-entry-followup-template";

describe("Organizer manual Entry follow-up notices", () => {
  it("uses only the delegation inbox, never broad public destinations", () => {
    const draft = newOrganizerEntryFollowupTemplate();
    expect(draft.displaySurfaces).toEqual(["delegation_inbox"]);
    expect(draft.displaySurfaces).not.toContain("public_home");
    expect(draft.displaySurfaces).not.toContain("mysolaris_home");
  });

  it("requires the organizer to choose exact recipients rather than guessing identities", () => {
    const draft = newOrganizerEntryFollowupTemplate();
    expect(draft.audience).toBe("specific_countries");
    expect(draft.countryIds).toEqual([]);
    expect(draft.audienceGroup).toBeNull();
  });

  it("uses action-required severity, acknowledgement and no made-up issue", () => {
    const draft = newOrganizerEntryFollowupTemplate();
    expect(draft.noticeType).toBe("official_notice");
    expect(draft.severity).toBe("action_required");
    expect(draft.acknowledgementRequired).toBe(true);
    expect(draft.body).toBe("");
    expect(draft.scheduledAt).toBe("");
  });

  it("provides a fresh recipient set and deterministic reset on each use", () => {
    const first = newOrganizerEntryFollowupTemplate();
    first.countryIds.push("country-one");
    const next = newOrganizerEntryFollowupTemplate();
    expect(next.countryIds).toEqual([]);
    expect(next).toEqual(newOrganizerEntryFollowupTemplate());
  });

  it("invalidates follow-up confirmation after an edition switch or concurrent notice operation", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/_authenticated/admin/communications.tsx"), "utf8");
    expect(route).toContain("entryFollowupReviewEditionId !== editionId || busy");
    expect(route).toContain("if (busy || !editionId) return;");
    expect(route).toContain("setEntryFollowupReviewEditionId(editionId)");
    expect(route).toContain("setEntryFollowupReviewEditionId(null)");
    const preflight = route.indexOf("entryFollowupReviewEditionId !== editionId || busy");
    const reset = route.indexOf("resetComposer();", preflight);
    expect(preflight).toBeGreaterThan(-1);
    expect(reset).toBeGreaterThan(preflight);
    expect(route).toContain("Reopen the Entry follow-up review.");
  });

  it("requires explicit confirmation before replacing a composer and never invokes a mutation", () => {
    const route = readFileSync(resolve(process.cwd(), "src/routes/_authenticated/admin/communications.tsx"), "utf8");
    expect(route).toContain("newOrganizerEntryFollowupTemplate()");
    expect(route).toContain("entryFollowupReviewOpen");
    expect(route).toContain("Draft Entry follow-up");
    expect(route).toContain("This manual notice does not mark an Entry");
    expect(route).toContain("resetComposer();");
    expect(route).toContain("setCountryIds([...template.countryIds])");
    expect(route).toContain("setDisplaySurfaces([...template.displaySurfaces])");
    expect(route).toContain("setFollowupComposing(true)");
    expect(route).toContain("onConfirm={applyEntryFollowupTemplate}");
  });
});

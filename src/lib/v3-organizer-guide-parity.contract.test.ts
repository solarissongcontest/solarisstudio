import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const guide = readFileSync("src/routes/_authenticated/admin/guide.tsx", "utf8");

const guideCapability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
  (capability) => capability.legacyId === "workspace-organizer-guide",
);

describe("Organizer V3 Guide parity evidence", () => {
  it("registers the contextual Guide capability at parity without retiring its route", () => {
    expect(guideCapability).toBeDefined();
    expect(guideCapability?.classification).toBe("contextualize");
    expect(guideCapability?.migrationStatus).toBe("parity");
    expect(guideCapability?.legacyRoutes).toContain("/admin/guide");
    expect(guideCapability?.targetRoute).toBe("/admin/guide");
  });

  it("teaches the canonical Organizer mental model and explicit scope discipline", () => {
    expect(guide).toContain(
      "Its permanent destinations are Overview, Tasks, Control, Live and More.",
    );
    expect(guide).toContain(
      "ordinary work should begin from the state or task that needs attention rather than from a technical",
    );
    expect(guide).toContain("Use the edition context control in Organizer.");
    expect(guide).toContain(
      "critical review or confirmation surfaces repeat that scope",
    );
    expect(guide).toContain(
      "instead of silently substituting another\n            edition",
    );
  });

  it("covers every ordinary operating domain without making specialist tools top-level navigation", () => {
    expect(guide).toContain('title="How to use the organizer tools"');
    expect(guide).toContain("Control → participation, confirmations, rounds and access.");
    expect(guide).toContain("Control → entries, media, shows, running order and participation.");
    expect(guide).toContain("Control → rounds, Jury, Televote, declarations and integrity.");
    expect(guide).toContain(
      "Control → calculate, review, lock and deliberately publish official outcomes.",
    );
    expect(guide).toContain(
      "Configure presentation in Control; operate the active show in Live.",
    );
    expect(guide).toContain("Tasks is the exception/action queue.");
    expect(guide).toContain("More is for low-frequency and specialist groups");
  });

  it("teaches server-authoritative consequences instead of browser-owned workflow truth", () => {
    expect(guide).toContain(
      "Opening or closing official voting is an authoritative\n            operation, not a browser-only toggle.",
    );
    expect(guide).toContain(
      "Treat Results as a deliberate lifecycle: input, calculate, review, lock and publish.",
    );
    expect(guide).toContain(
      "Publication controls visibility. Historical and official contest data should normally remain\n            preserved",
    );
    expect(guide).toContain(
      "completed canonical work should resolve its task instead of requiring manual housekeeping.",
    );
  });

  it("remains a private observational help surface with no second data or mutation authority", () => {
    expect(guide).toContain('{ name: "robots", content: "noindex" }');
    expect(guide).not.toContain("supabase");
    expect(guide).not.toContain("useQuery(");
    expect(guide).not.toContain("useMutation(");
    expect(guide).not.toContain(".insert(");
    expect(guide).not.toContain(".update(");
    expect(guide).not.toContain(".delete(");
  });
});

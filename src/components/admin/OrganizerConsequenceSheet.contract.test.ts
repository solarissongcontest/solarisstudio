import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/admin/OrganizerConsequenceSheet.tsx", "utf8");

describe("Organizer ConsequenceSheet contract", () => {
  it("renders the canonical consequence review fields", () => {
    expect(source).toContain('label="Edition"');
    expect(source).toContain('label="Show"');
    expect(source).toContain('label="Target"');
    expect(source).toContain('label="Affected"');
    expect(source).toContain('label="Reversibility"');
    expect(source).toContain('label="Public effect"');
    expect(source).toContain('label="Notifications"');
    expect(source).toContain('title="Consequences"');
  });

  it("binds the review to explicit edition/show scope and expected version", () => {
    expect(source).toContain('const scope = [preflight.editionLabel, preflight.showLabel]');
    expect(source).toContain('label="Expected version"');
    expect(source).toContain("preflight.expectedVersion");
  });

  it("fails closed while authoritative preflight blockers remain", () => {
    expect(source).toContain("const blocked = blockers.length > 0");
    expect(source).toContain("const confirmDisabled = busy || blocked || !confirmationSatisfied");
    expect(source).toContain("cannot be applied while authoritative preflight blockers remain");
  });

  it("supports review, explicit acknowledgement, typed confirmation and reauthentication input without inventing risk", () => {
    expect(source).toContain('mode: "review" | "explicit" | "typed" | "reauth"');
    expect(source).toContain('preflight.confirmation.mode === "explicit"');
    expect(source).toContain('preflight.confirmation.mode === "typed"');
    expect(source).toContain('preflight.confirmation.mode === "reauth"');
    expect(source).toContain("reauthenticationSatisfied");
    expect(source).toContain("The parent workflow must reauthenticate the organizer before commit");
  });

  it("does not own server preflight, authorization or mutation", () => {
    expect(source).not.toContain("supabase");
    expect(source).not.toContain(".rpc(");
    expect(source).not.toContain(".from(");
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("fetch(");
    expect(source).not.toContain("createServerFn");
  });

  it("does not allow typed or reauth confirmation to silently pass", () => {
    expect(source).toContain("typed.trim() !== requiredPhrase");
    expect(source).toContain("requiresReauth && !reauthenticationSatisfied");
    expect(source).toContain("disabled={confirmDisabled}");
  });

  it("keeps higher-risk operations visibly distinct", () => {
    expect(source).toContain('preflight.riskTier >= 3 ? "blocked" : "attention"');
    expect(source).toContain('preflight.riskTier >= 3 ? "admin-action-danger" : "admin-action-primary"');
    expect(source).toContain("Tier {preflight.riskTier}");
  });
});

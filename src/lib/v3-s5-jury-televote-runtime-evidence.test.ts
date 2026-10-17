import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { v3DomainConsequence } from "./v3-domain-consequence-registry";

const mediaRehearsal = ".github/scripts/v3-s5-media-consequences-rehearsal.sh";
const juryRehearsal = ".github/scripts/v3-s5-jury-consequences-rehearsal.sh";
const televoteRehearsal = ".github/scripts/v3-s5-televote-consequences-rehearsal.sh";
const productionUpgrade = readFileSync(
  ".github/scripts/v3-production-head-upgrade-rehearsal.sh",
  "utf8",
);
const productionUpgradeWorkflow = readFileSync(
  ".github/workflows/v3-production-head-upgrade.yml",
  "utf8",
);

describe("System V3 S5 Media/Jury/Televote runtime evidence", () => {
  it("binds executable Media consequence proof to media.reviewed", () => {
    const consequence = v3DomainConsequence("media.reviewed");
    expect(consequence?.implementationState).toBe("event-backed");
    expect(consequence?.evidence).toContain(mediaRehearsal);
  });

  it("binds executable Jury consequence proof to every Jury event", () => {
    for (const eventType of ["jury.opened", "jury.closed", "jury.ballot_changed"]) {
      const consequence = v3DomainConsequence(eventType);
      expect(consequence?.implementationState).toBe("event-backed");
      expect(consequence?.evidence).toContain(juryRehearsal);
    }
  });

  it("binds executable Televote consequence proof to every Televote event", () => {
    for (const eventType of ["televote.opened", "televote.closed", "televote.ballot_submitted"]) {
      const consequence = v3DomainConsequence(eventType);
      expect(consequence?.implementationState).toBe("event-backed");
      expect(consequence?.evidence).toContain(televoteRehearsal);
    }
  });

  it("keeps every new destructive rehearsal local-only", () => {
    for (const path of [mediaRehearsal, juryRehearsal, televoteRehearsal]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("Refusing hosted Supabase rehearsal");
      expect(source).toContain("Refusing non-local database rehearsal");
    }
  });

  it("forces all three runtime proofs through the production-head upgrade path", () => {
    expect(productionUpgrade).toContain("v3-s5-media-consequences-rehearsal.sh");
    expect(productionUpgrade).toContain("v3-s5-jury-consequences-rehearsal.sh");
    expect(productionUpgrade).toContain("v3-s5-televote-consequences-rehearsal.sh");
  });

  it("runs the production-head gate whenever an S5 consequence rehearsal changes", () => {
    expect(productionUpgradeWorkflow).toContain(
      '".github/scripts/v3-s5-*-consequences-rehearsal.sh"',
    );
  });
});

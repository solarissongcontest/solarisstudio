import { describe, expect, it } from "vitest";

import {
  EDITION_PHASES,
  canTransitionEditionPhase,
  editionPhaseProgress,
  getAvailableEditionPhaseTransitions,
  isEditionPhase,
} from "./edition-state";

describe("edition state engine", () => {
  it("recognizes every canonical edition phase", () => {
    for (const phase of EDITION_PHASES) {
      expect(isEditionPhase(phase)).toBe(true);
    }

    expect(isEditionPhase("active")).toBe(false);
    expect(isEditionPhase("completed")).toBe(false);
    expect(isEditionPhase(null)).toBe(false);
  });

  it("allows the normal contest lifecycle", () => {
    expect(canTransitionEditionPhase("draft", "planning")).toBe(true);
    expect(canTransitionEditionPhase("planning", "confirmations")).toBe(true);
    expect(canTransitionEditionPhase("confirmations", "submissions")).toBe(true);
    expect(canTransitionEditionPhase("jury_voting", "live_show")).toBe(true);
    expect(canTransitionEditionPhase("televoting", "vote_verification")).toBe(true);
    expect(canTransitionEditionPhase("post_edition", "archived")).toBe(true);
  });

  it("rejects impossible jumps and archived mutations", () => {
    expect(canTransitionEditionPhase("planning", "results")).toBe(false);
    expect(canTransitionEditionPhase("confirmations", "live_show")).toBe(false);
    expect(canTransitionEditionPhase("archived", "planning")).toBe(false);
    expect(getAvailableEditionPhaseTransitions("archived")).toEqual([]);
  });

  it("supports explicit recovery paths around vote verification", () => {
    expect(canTransitionEditionPhase("vote_verification", "televoting")).toBe(true);
    expect(canTransitionEditionPhase("results", "vote_verification")).toBe(true);
  });

  it("treats a transition to the current phase as idempotent", () => {
    expect(canTransitionEditionPhase("live_show", "live_show")).toBe(true);
  });

  it("reports lifecycle progress from zero to one", () => {
    expect(editionPhaseProgress("draft")).toBe(0);
    expect(editionPhaseProgress("archived")).toBe(1);
    expect(editionPhaseProgress("live_show")).toBeGreaterThan(0);
    expect(editionPhaseProgress("live_show")).toBeLessThan(1);
  });
});

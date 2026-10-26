import { describe, expect, it } from "vitest";
import {
  isResolvedV3DomainConsequence,
  isV3NonEventConsequenceReplacement,
  v3DomainConsequence,
  validateV3DomainConsequenceRegistry,
} from "./v3-domain-consequence-registry";

const worker9EventBacked = [
  "edition.transitioned",
  "selection.reviewed",
  "selection.winner_changed",
  "participation.changed",
  "community_profile.moderated",
] as const;

const worker3Replacements = [
  "receipt.recorded",
  "receipt.reconciled",
  "audit.recorded",
  "public_ux.observed",
  "task.opened",
  "task.resolved",
  "job.started",
  "job.completed",
  "job.failed",
] as const;

describe("Worker 9 cumulative consequence runtime", () => {
  it("keeps all Round 1 and Round 2 event families resolved", () => {
    for (const eventType of worker9EventBacked) {
      const consequence = v3DomainConsequence(eventType);
      expect(consequence, eventType).not.toBeNull();
      expect(consequence?.implementationState, eventType).toBe("event-backed");
      expect(isResolvedV3DomainConsequence(consequence!), eventType).toBe(true);
    }
  });

  it("does not reopen a moderation task after the moderation decision completes", () => {
    const consequence = v3DomainConsequence("community_profile.moderated");
    expect(consequence?.taskEffects).toEqual([]);
  });

  it("preserves Worker 3 non-event replacement classifications", () => {
    for (const eventType of worker3Replacements) {
      const consequence = v3DomainConsequence(eventType);
      expect(consequence, eventType).not.toBeNull();
      expect(isV3NonEventConsequenceReplacement(consequence!), eventType).toBe(true);
      expect(isResolvedV3DomainConsequence(consequence!), eventType).toBe(true);
    }
  });

  it("keeps the complete consequence registry internally valid", () => {
    expect(validateV3DomainConsequenceRegistry()).toEqual([]);
  });
});

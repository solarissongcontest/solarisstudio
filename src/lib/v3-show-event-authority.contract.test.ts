import { describe, expect, it } from "vitest";
import {
  isResolvedV3DomainConsequence,
  v3DomainConsequence,
  v3DomainConsequenceImplementationErrors,
} from "./v3-domain-consequence-registry";

for (const eventType of ["show.changed", "show.cue_changed"] as const) {
  describe(`${eventType} authority`, () => {
    it("is a persisted observational fact rather than an invented async authority", () => {
      const consequence = v3DomainConsequence(eventType);
      expect(consequence).not.toBeNull();
      expect(consequence?.implementationState).toBe("persisted-observational");
      expect(consequence?.taskEffects).toEqual([]);
      expect(consequence?.notificationEffects).toEqual([]);
      expect(consequence?.publicationEffects).toEqual([]);
      expect(consequence?.realtimeEffects).toEqual([]);
      expect(consequence?.analyticsEffects).toEqual([]);
      expect(consequence?.consumers).toEqual([]);
      expect(consequence?.auditRequired).toBe(true);
    });

    it("is resolved only because the canonical operation/event evidence exists", () => {
      const consequence = v3DomainConsequence(eventType)!;
      expect(v3DomainConsequenceImplementationErrors(consequence)).toEqual([]);
      expect(isResolvedV3DomainConsequence(consequence)).toBe(true);
      if (eventType === "show.changed") {
        expect(consequence.evidence).toContain("supabase/migrations/20261027211500_v3_show_runtime_authority.sql");
        expect(consequence.evidence).toContain("supabase/migrations/20261027213000_v3_show_definition_authority.sql");
      } else {
        expect(consequence.evidence).toContain("supabase/migrations/20261027204600_v3_show_cue_authority.sql");
      }
    });
  });
}

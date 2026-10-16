import { describe, expect, it } from "vitest";

import {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  validateV3DomainConsequenceRegistry,
  v3DomainConsequence,
} from "./v3-domain-consequence-registry";
import { V3_SYSTEM_DOMAIN_REGISTRY } from "./v3-system-domain-registry";
import {
  V3_WORKFLOW_DEPENDENCY_REGISTRY,
  validateV3WorkflowDependencyRegistry,
  v3WorkflowDependency,
} from "./v3-workflow-dependency-registry";

describe("System V3 S1 registries", () => {
  it("keeps workflow dependency ownership internally valid", () => {
    expect(validateV3WorkflowDependencyRegistry()).toEqual([]);
    expect(new Set(V3_WORKFLOW_DEPENDENCY_REGISTRY.map((item) => item.operation)).size).toBe(
      V3_WORKFLOW_DEPENDENCY_REGISTRY.length,
    );
  });

  it("records the canonical cross-domain result finalization blockers", () => {
    const dependency = v3WorkflowDependency("results.finalize");
    expect(dependency).not.toBeNull();
    expect(dependency?.requires.map((item) => item.domain)).toEqual([
      "jury",
      "televote",
      "voting-configuration",
      "integrity",
    ]);
    expect(dependency?.requires.every((item) => item.severity === "blocking")).toBe(true);
  });

  it("records publication and jury-close prerequisites separately from UI state", () => {
    const entryPublication = v3WorkflowDependency("entry.publish");
    expect(entryPublication?.requires.map((item) => item.domain)).toEqual([
      "entry",
      "media",
      "publication",
    ]);

    const juryClose = v3WorkflowDependency("jury.close");
    expect(juryClose?.requires.some((item) => item.domain === "permissions")).toBe(true);
    expect(juryClose?.requires.some((item) => item.severity === "advisory")).toBe(true);
  });

  it("maps every declared domain event to one consequence entry", () => {
    expect(validateV3DomainConsequenceRegistry()).toEqual([]);
    const declaredEvents = V3_SYSTEM_DOMAIN_REGISTRY.flatMap((domain) => domain.eventTypes).sort();
    const consequenceEvents = V3_DOMAIN_CONSEQUENCE_REGISTRY.map((item) => item.eventType).sort();
    expect(consequenceEvents).toEqual(declaredEvents);
  });

  it("marks only consequences with concrete S5 evidence as event-backed", () => {
    const eventBacked = V3_DOMAIN_CONSEQUENCE_REGISTRY
      .filter((item) => item.implementationState === "event-backed")
      .map((item) => item.eventType)
      .sort();

    expect(eventBacked).toEqual([
      "confirmation.submitted",
      "confirmation.window_changed",
      "entry.changes_requested",
      "entry.reviewed",
      "jury.ballot_changed",
      "jury.closed",
      "jury.opened",
      "media.reviewed",
      "notice.published",
      "notice.superseded",
      "publication.changed",
      "publication.failed",
      "results.calculated",
      "results.locked",
      "results.verified",
      "televote.ballot_submitted",
      "televote.closed",
      "televote.opened",
    ]);

    const migrated = new Set(eventBacked);
    expect(
      V3_DOMAIN_CONSEQUENCE_REGISTRY
        .filter((item) => !migrated.has(item.eventType))
        .every((item) => item.implementationState === "declared"),
    ).toBe(true);
  });

  it("only connects notifications where a current producer is explicitly evidenced", () => {
    expect(v3DomainConsequence("jury.opened")?.notificationEffects).toEqual([
      { effect: "evaluate-provider", providerId: "jury-open" },
    ]);
    expect(v3DomainConsequence("notice.published")?.notificationEffects).toEqual([
      { effect: "evaluate-provider", providerId: "official-communications" },
    ]);
    expect(v3DomainConsequence("notice.superseded")?.notificationEffects).toEqual([]);
    expect(v3DomainConsequence("results.calculated")?.notificationEffects).toEqual([]);
  });

  it("keeps delivery-failure task ownership in Notification lifecycle events, not Notice", () => {
    expect(v3DomainConsequence("notice.published")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("notice.superseded")?.taskEffects).toEqual([]);
    for (const eventType of [
      "notification.queued",
      "notification.delivered",
      "notification.failed",
    ]) {
      expect(v3DomainConsequence(eventType)?.taskEffects).toEqual([
        { effect: "re-evaluate", taskType: "notification.delivery_failed" },
      ]);
    }
  });
});

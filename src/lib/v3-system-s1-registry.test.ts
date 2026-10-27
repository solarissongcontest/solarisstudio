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
      "acknowledgement.recorded",
      "confirmation.submitted",
      "confirmation.window_changed",
      "edition.archived",
      "entry.changes_requested",
      "entry.reviewed",
      "entry.submitted",
      "entry.version_changed",
      "jury.ballot_changed",
      "jury.closed",
      "jury.opened",
      "media.reviewed",
      "membership.changed",
      "notice.published",
      "notice.superseded",
      "notification.delivered",
      "notification.failed",
      "notification.queued",
      "permissions.changed",
      "prediction.changed",
      "prediction.scored",
      "preference.changed",
      "publication.changed",
      "publication.failed",
      "results.calculated",
      "results.locked",
      "results.verified",
      "televote.ballot_submitted",
      "televote.closed",
      "televote.opened",
    ]);

    const replacements = V3_DOMAIN_CONSEQUENCE_REGISTRY
      .filter((item) => item.implementationState === "replaced-by-read")
      .map((item) => item.eventType);
    expect([...replacements].sort()).toEqual(["activity.projected", "receipt.reconciled"]);
    expect(v3DomainConsequence("receipt.reconciled")?.replacement?.operation).toBe(
      "public.studio2_reconcile_operation(uuid)",
    );
    const migrated = new Set([...eventBacked, ...replacements]);
    expect(
      V3_DOMAIN_CONSEQUENCE_REGISTRY
        .filter((item) => !migrated.has(item.eventType))
        .every((item) => item.implementationState === "declared"),
    ).toBe(true);
  });

  it("records Archive as an event-backed Edition consequence", () => {
    const archive = v3DomainConsequence("edition.archived");
    expect(archive?.implementationState).toBe("event-backed");
    expect(archive?.ownerDomain).toBe("edition");
    expect(archive?.evidence).toEqual(
      expect.arrayContaining([
        "supabase/migrations/20261019112100_v3_s14_archive_consequence_reconciliation.sql",
        "src/lib/v3-s14-archive-consequences.contract.test.ts",
        ".github/scripts/v3-s14-archive-system-rehearsal.sh",
      ]),
    );
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

  it("assigns delivery-failure task causality only to notification.failed", () => {
    expect(v3DomainConsequence("notice.published")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("notice.superseded")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("notification.queued")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("notification.delivered")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("notification.failed")?.taskEffects).toEqual([
      { effect: "re-evaluate", taskType: "notification.delivery_failed" },
    ]);
  });

  it("records acknowledgement S5 ownership without inventing a separate task worker", () => {
    expect(v3DomainConsequence("acknowledgement.recorded")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("acknowledgement.recorded")?.ownerDomain).toBe("acknowledgement");
    expect(v3DomainConsequence("acknowledgement.recorded")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("acknowledgement.recorded")?.notificationEffects).toEqual([]);
  });

  it("records the complete Entry lifecycle S5 ownership", () => {
    for (const eventType of [
      "entry.submitted",
      "entry.version_changed",
      "entry.reviewed",
      "entry.changes_requested",
    ]) {
      expect(v3DomainConsequence(eventType)?.implementationState).toBe("event-backed");
      expect(v3DomainConsequence(eventType)?.ownerDomain).toBe("entry");
    }
  });

  it("records canonical membership/access S5 ownership", () => {
    expect(v3DomainConsequence("membership.changed")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("membership.changed")?.ownerDomain).toBe("membership");
    expect(v3DomainConsequence("permissions.changed")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("permissions.changed")?.ownerDomain).toBe("permissions");
    expect(v3DomainConsequence("permissions.changed")?.taskEffects).toEqual([
      { effect: "re-evaluate", taskType: "permissions.approval_required" },
    ]);
  });

  it("records private follow preference S5 ownership without fabricated task or notification effects", () => {
    expect(v3DomainConsequence("preference.changed")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("preference.changed")?.ownerDomain).toBe("personal-preference");
    expect(v3DomainConsequence("preference.changed")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("preference.changed")?.notificationEffects).toEqual([]);
  });

  it("records Prediction configuration and scoring S5 ownership without claiming an undeployed task reconciler", () => {
    expect(v3DomainConsequence("prediction.changed")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("prediction.changed")?.ownerDomain).toBe("prediction");
    expect(v3DomainConsequence("prediction.changed")?.taskEffects).toEqual([]);
    expect(v3DomainConsequence("prediction.scored")?.implementationState).toBe("event-backed");
    expect(v3DomainConsequence("prediction.scored")?.ownerDomain).toBe("prediction");
    expect(v3DomainConsequence("prediction.scored")?.taskEffects).toEqual([]);
  });
});

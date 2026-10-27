import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOLARIS_V6_DOMAINS } from "./solaris-v6-domain-registry";
import {
  isResolvedV3DomainConsequence,
  isV3ReadOnlyConsequenceReplacement,
  v3DomainConsequence,
} from "./v3-domain-consequence-registry";
import {
  V3_PROJECTION_RECONCILIATION_REGISTRY,
  validateV3ProjectionReconciliationRegistry,
  v3ProjectionsInvalidatedByEvent,
} from "./v3-projection-reconciliation-registry";

const sql = readFileSync(
  "supabase/migrations/20261019213500_v3_participant_activity_projection.sql",
  "utf8",
);
const fixture = readFileSync(".github/tests/v3-participant-activity.sql", "utf8");
const rehearsal = readFileSync(".github/scripts/v3-participant-activity-regression.sh", "utf8");
function activity() {
  const row = v3DomainConsequence("activity.projected");
  if (!row) throw new Error("Missing Activity catalog identity");
  return row;
}

describe("derived recipient Activity replaces an independently writable consequence", () => {
  it("implements the existing no-command reconstruction specification", () => {
    const domain = SOLARIS_V6_DOMAINS.find((row) => row.id === "activity")!;
    expect(domain.commands).toEqual([]);
    expect(domain.migrationState).toBe("canonical-read");
    expect(domain.canonicalWriteModel).toContain("derived recipient projection");
    expect(domain.retirementCriteria).toContain(
      "Activity is reconstructed from canonical source events and cannot independently mutate domain state.",
    );
    const row = activity();
    expect(row.ownerDomain).toBe("activity");
    expect(row.implementationState).toBe("replaced-by-read");
    expect(row.replacement).toMatchObject({
      operation: "public.v3_my_participant_activity(timestamptz,integer,uuid)",
      boundedBy: "authenticated recipient; at most 50 rows per keyset page",
    });
    expect(isResolvedV3DomainConsequence(row)).toBe(true);
    expect(isV3ReadOnlyConsequenceReplacement(row)).toBe(true);
    for (const path of row.replacement!.evidence)
      expect(readFileSync(path, "utf8").length).toBeGreaterThan(0);
  });

  it("does not fabricate events, analytics, audit or outbox work when history is read", () => {
    const row = activity();
    for (const effects of [
      row.taskEffects,
      row.notificationEffects,
      row.publicationEffects,
      row.realtimeEffects,
      row.analyticsEffects,
    ])
      expect(effects).toEqual([]);
    expect(row.auditRequired).toBe(false);
    const definition = sql.slice(
      sql.indexOf("create or replace function public.v3_my_participant_activity("),
      sql.indexOf("$activity$;"),
    );
    expect(definition).toMatch(/\bstable\b/i);
    const body = definition
      .slice(definition.indexOf("as $activity$") + "as $activity$".length)
      .replace(/--[^\n]*/g, " ");
    expect(body).not.toMatch(
      /\b(insert|update|delete|merge|truncate|alter|create|drop|perform|execute|call|nextval|set_config)\b/i,
    );
    expect(body).toContain("receipt.actor_id = v_actor");
    expect(body).toContain("jury_op.user_id = v_actor");
    expect(body).toContain("least(greatest(coalesce(p_limit, 30), 1), 50)");
    expect(v3ProjectionsInvalidatedByEvent("activity.projected")).toEqual([]);
  });

  it("keeps canonical source changes as invalidations and exposes a bounded reconstruction path", () => {
    const projections = V3_PROJECTION_RECONCILIATION_REGISTRY.filter((row) =>
      row.canonicalDomains.includes("activity"),
    );
    expect(projections.length).toBeGreaterThan(0);
    for (const projection of projections) {
      expect(projection.invalidatingEvents).not.toContain("activity.projected");
      expect(projection.invalidatingEvents).toEqual([
        "confirmation.submitted",
        "entry.version_changed",
        "jury.ballot_changed",
        "televote.ballot_submitted",
      ]);
      expect(projection.repair.scope).toBe("actor");
      expect(projection.repair.rebuildPath).toContain("v3_my_participant_activity");
      expect(projection.repair.state).toBe("rebuildable");
    }
    expect(validateV3ProjectionReconciliationRegistry()).toEqual([]);
  });

  it("links executable local proof of canonical source identity, dedupe, isolation and unchanged ledgers", () => {
    for (const assertion of [
      "Keyset pagination duplicated an operation",
      "Equal-timestamp pagination skipped canonical operations",
      "Organizer activity read widened to another actor",
      "Activity read mutated canonical truth",
      "Activity projection is not STABLE",
      "Activity reconciliation disagrees with canonical version truth",
    ])
      expect(fixture).toContain(assertion);
    expect(rehearsal).toContain("Activity consumes actual canonical Jury submission once");
    expect(rehearsal).toContain("v3-jury-security-rehearsal.sh");
    expect(rehearsal).toContain(
      "Refusing participant activity regression against a non-local target",
    );
  });

  it("does not allow this proof to resolve a real mutation or missing evidence", () => {
    const row = activity();
    expect(isResolvedV3DomainConsequence({ ...row, eventType: "receipt.recorded" })).toBe(false);
    expect(isResolvedV3DomainConsequence({ ...row, evidence: [] })).toBe(false);
    expect(isResolvedV3DomainConsequence({ ...row, analyticsEffects: ["unimplemented"] })).toBe(
      false,
    );
    for (const event of [
      "receipt.recorded",
      "edition.changed",
      "identity.signed_out",
      "task.opened",
    ])
      expect(v3DomainConsequence(event)?.implementationState).toBe("declared");
  });
});

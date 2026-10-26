import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isV3DerivedConsequenceReplacement,
  v3DomainConsequence,
  v3DomainConsequenceImplementationErrors,
  type V3DomainConsequence,
} from "./v3-domain-consequence-registry";
import { v3ProjectionsInvalidatedByEvent } from "./v3-projection-reconciliation-registry";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source(
  "supabase/migrations/20261019213500_v3_participant_activity_projection.sql",
);
const server = source("src/integrations/v3/participant-activity.server.ts");

describe("Worker 3 R2 participant Activity consequence", () => {
  it("classifies activity.projected as a deterministic actor-scoped projection", () => {
    const activity = v3DomainConsequence("activity.projected");
    expect(activity).not.toBeNull();
    expect(activity?.implementationState).toBe("replaced-by-derived-projection");
    expect(activity?.ownerDomain).toBe("activity");
    expect(activity?.replacement?.kind).toBe("canonical-derived-projection");
    expect(isV3DerivedConsequenceReplacement(activity!)).toBe(true);
    expect(activity?.replacement).toMatchObject({
      operation: "public.v3_my_participant_activity(timestamptz,integer,uuid)",
      boundedBy:
        "authenticated actor only; allowlisted operation families; 1-50 rows per page with a stable timestamp+operation cursor",
    });
    expect(activity?.taskEffects).toEqual([]);
    expect(activity?.notificationEffects).toEqual([]);
    expect(activity?.publicationEffects).toEqual([]);
    expect(activity?.realtimeEffects).toEqual([]);
    expect(activity?.analyticsEffects).toEqual([]);
    expect(activity?.auditRequired).toBe(false);
  });

  it("reconstructs Activity from canonical completed operations rather than writable Activity truth", () => {
    expect(migration).toContain(
      "create or replace function public.v3_my_participant_activity(",
    );
    expect(migration).toContain("language plpgsql");
    expect(migration).toContain("stable");
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("from public.studio2_operation_receipts receipt");
    expect(migration).toContain("from private.v3_jury_operations jury_op");
    expect(migration).toContain("receipt.status = 'succeeded'");
    expect(migration).toContain("receipt.actor_id = v_actor");
    expect(migration).toContain("jury_op.user_id = v_actor");
    expect(migration).toContain("confirmation.submit");
    expect(migration).toContain("entry.submit");
    expect(migration).toContain("televote.submit");
    expect(migration).toContain("jury.ballot_submitted");
    expect(migration).not.toMatch(/create\s+table[^;]*activity/i);
    expect(migration).not.toMatch(/insert\s+into[^;]*activity/i);
  });

  it("keeps the read bounded, stable and private", () => {
    expect(migration).toContain("greatest(coalesce(p_limit, 30), 1)");
    expect(migration).toContain("least(");
    expect(migration).toContain("50");
    expect(migration).toContain("p_before_operation_id uuid default null");
    expect(migration).toContain("grant execute on function public.v3_my_participant_activity");
    expect(migration).toContain("to authenticated");
    expect(server).toContain('rpc("v3_my_participant_activity"');
    expect(server).toContain("p_limit: input.limit ?? 30");
    expect(server).toContain("p_before_operation_id: input.beforeOperationId ?? null");
  });

  it("does not fabricate a projection-invalidating activity.projected event", () => {
    expect(v3ProjectionsInvalidatedByEvent("activity.projected")).toEqual([]);
  });

  it("rejects a forged Activity replacement contract", () => {
    const activity = v3DomainConsequence("activity.projected")!;
    expect(activity.replacement?.kind).toBe("canonical-derived-projection");

    const forged = {
      ...activity,
      replacement: {
        ...activity.replacement!,
        operation: "public.unbounded_activity_feed()",
      },
    } as V3DomainConsequence;
    expect(v3DomainConsequenceImplementationErrors(forged)).not.toEqual([]);

    const withInventedEffect = {
      ...activity,
      realtimeEffects: [
        { effect: "invalidate-projection", projection: "participant activity feed projection" },
      ],
    } as V3DomainConsequence;
    expect(v3DomainConsequenceImplementationErrors(withInventedEffect)).not.toEqual([]);
  });
});

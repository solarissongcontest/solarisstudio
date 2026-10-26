import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isResolvedV3DomainConsequence,
  v3DomainConsequence,
} from "./v3-domain-consequence-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const authority = source(
  "supabase/migrations/20261019221400_v3_incident_command_authority.sql",
);
const reconciliation = source(
  "supabase/migrations/20261019221430_v3_incident_task_reconciliation.sql",
);
const taskEngine = source(
  "supabase/migrations/20261002211500_organisation_os_v5_task_engine.sql",
);
const archive = source(
  "supabase/migrations/20261019112400_v3_s14_archive_task_registry_alignment.sql",
);

function applyBody() {
  const start = authority.indexOf(
    "create or replace function public.studio2_apply_incident_command_v3(",
  );
  const end = authority.indexOf(
    "revoke all on function public.studio2_apply_incident_command_v3",
    start,
  );
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return authority.slice(start, end);
}

describe("System V3 S15 incident.changed consequence runtime", () => {
  it("consumes the canonical Incident operation instead of creating a second producer", () => {
    const apply = applyBody();
    expect(apply).toContain("v_actor uuid := auth.uid()");
    expect(apply).toContain("studio2_access_allowed(v_required_capability, p_edition_id, true)");
    expect(apply).toContain("v_before.edition_id is distinct from p_edition_id");
    expect(apply).toContain("private.studio2_claim_operation(");
    expect(apply).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
    expect(apply).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(apply).toContain("private.v3_emit_domain_event(");
    expect(apply).toContain("'incident.changed'");
    expect(apply).toContain("v_after.version");
    expect(apply).toContain("v_operation_id");
  });

  it("handles lost-response replay before mutable expected-version rejection", () => {
    const apply = applyBody();
    const claim = apply.indexOf("private.studio2_claim_operation(");
    const replay = apply.indexOf("if coalesce((v_claim ->> 'replayed')::boolean, false)");
    const lock = apply.indexOf("for update;", replay);
    const stale = apply.indexOf("v_before.version is distinct from p_expected_version", lock);
    expect(claim).toBeGreaterThanOrEqual(0);
    expect(replay).toBeGreaterThan(claim);
    expect(lock).toBeGreaterThan(replay);
    expect(stale).toBeGreaterThan(lock);
  });

  it("uses deterministic synchronous Organizer task reconciliation", () => {
    expect(reconciliation).toContain(
      "perform private.studio2_reconcile_all_organizer_tasks(new.edition_id)",
    );
    expect(reconciliation).toContain("after insert or update on public.studio2_incidents");
    expect(taskEngine).toContain("task.source_kind = 'incident'");
    expect(taskEngine).toContain("'incident.response'");
    expect(taskEngine).toContain("on conflict (source_key) do update");
    expect(reconciliation).not.toContain("insert into public.studio2_organizer_tasks");
  });

  it("preserves Archive semantics: incident response is governance/operational history, not current-workflow work", () => {
    expect(archive).toContain("Incident/integrity/governance work is deliberately");
    expect(archive).not.toContain("incident|confirmation");
    expect(archive).not.toContain("incident.response");
  });

  it("marks only the existing Incident consequence contract event-backed", () => {
    const consequence = v3DomainConsequence("incident.changed");
    expect(consequence).not.toBeNull();
    expect(consequence?.ownerDomain).toBe("incident");
    expect(consequence?.implementationState).toBe("event-backed");
    expect(consequence?.taskEffects).toEqual([
      { effect: "re-evaluate", taskType: "incident.response" },
    ]);
    expect(consequence?.notificationEffects).toEqual([]);
    expect(isResolvedV3DomainConsequence(consequence!)).toBe(true);
  });
});

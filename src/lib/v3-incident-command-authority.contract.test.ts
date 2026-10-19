import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20261019221400_v3_incident_command_authority.sql",
);
const client = source("src/lib/v3-incident-command.ts");
const lifecycle = source(
  "supabase/migrations/20261003190000_organisation_os_v5_incident_lifecycle.sql",
);
const registry = source("src/lib/solaris-v6-domain-registry.ts");

function block(start: string, end: string) {
  const from = migration.indexOf(start);
  const to = migration.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return migration.slice(from, to);
}

describe("V3 Incident Command authority", () => {
  it("uses an additive S13 migration and makes version advance for legacy and V3 writes", () => {
    expect(migration).toContain("'v3.s7.incident-command-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("add column if not exists version bigint");
    expect(migration).toContain("new.version := old.version + 1");
    expect(migration).toContain("before update on public.studio2_incidents");
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdrop\s+table\b/i);
  });

  it("keeps the mature lifecycle as authority instead of inventing a second state machine", () => {
    expect(lifecycle).toContain("private.studio2_incident_transition_allowed");
    expect(lifecycle).toContain("'resolved->investigating'");
    expect(lifecycle).toContain("'resolved->monitoring'");
    expect(migration).toContain("public.studio2_transition_incident(p_incident_id, v_to)");
    expect(migration).toContain("public.studio2_update_incident(");
    expect(migration).toContain("public.studio2_acknowledge_incident(p_incident_id)");
    expect(migration).toContain("public.studio2_declare_incident_crisis(p_incident_id)");
    expect(migration).toContain("public.studio2_add_incident_timeline_event(p_incident_id, v_message)");
  });

  it("provides bounded exact-edition Incident Command reads", () => {
    const projection = block(
      "create or replace function public.studio2_incident_command_projection(",
      "revoke all on function public.studio2_incident_command_projection",
    );
    expect(projection).toContain("v_limit < 1 or v_limit > 100");
    expect(projection).toContain("incident.edition_id = p_edition_id");
    expect(projection).toContain("event_source.edition_id = p_edition_id");
    expect(projection).toContain("event_source.entity_type = 'incident'");
    expect(projection).toContain("'version', incident.version");
    expect(projection).not.toContain("select * from public.studio2_incidents");
  });

  it("preflights scope, risk, consequence and expected version from canonical state", () => {
    const preflight = block(
      "create or replace function public.studio2_incident_command_preflight(",
      "revoke all on function public.studio2_incident_command_preflight",
    );
    expect(preflight).toContain("incident.id = p_incident_id");
    expect(preflight).toContain("incident.edition_id = p_edition_id");
    expect(preflight).toContain("'expectedVersion'");
    expect(preflight).toContain("'riskClass'");
    expect(preflight).toContain("'requiredCapability'");
    expect(preflight).toContain("'consequences'");
    expect(preflight).toContain("v_required_capability := 'incident.resolve'");
  });

  it("claims semantic operation identity before mutable CAS and rejects stale reviews", () => {
    const apply = block(
      "create or replace function public.studio2_apply_incident_command_v3(",
      "revoke all on function public.studio2_apply_incident_command_v3",
    );
    const claimIndex = apply.indexOf("private.studio2_claim_operation(");
    const lockIndex = apply.indexOf("for update;", claimIndex);
    const versionIndex = apply.indexOf("v_before.version is distinct from p_expected_version");
    expect(claimIndex).toBeGreaterThanOrEqual(0);
    expect(lockIndex).toBeGreaterThan(claimIndex);
    expect(versionIndex).toBeGreaterThan(lockIndex);
    expect(apply).toContain("message = 'VERSION_CONFLICT'");
    expect(apply).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(apply).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("requires fresh authentication and a reason for crisis, resolution and reopen", () => {
    expect(migration).toContain("v_risk := 'R3'");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(migration).toContain("v_required_capability := 'incident.resolve'");
    expect(migration).toContain("elsif v_before.status = 'resolved' then");
    expect(migration).toContain("if v_reason is null then");
    expect(migration).toContain("auth_freshness_evidence = v_freshness");
  });

  it("writes audit evidence and the canonical incident.changed DomainEvent exactly at the operation boundary", () => {
    expect(registry).toContain('events: ["incident.changed"]');
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'operationId', v_operation_id");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'incident.changed'");
    expect(migration).toContain("v_after.version");
    expect(migration).toContain("'eventId', v_event_id");
    expect(migration).toContain("'receiptId', v_operation_id");
  });

  it("uses stable client operation identity and reconciles instead of retrying the mutation", () => {
    expect(client).toContain("createOrganisationCommand");
    expect(client).toContain('supabase.rpc("studio2_apply_incident_command_v3"');
    expect(client).toContain("p_operation_id: command.operationId");
    expect(client).toContain("p_idempotency_key: command.idempotencyKey");
    expect(client).toContain('supabase.rpc("studio2_reconcile_operation"');
    expect(client.match(/studio2_apply_incident_command_v3/g)?.length).toBe(1);
    expect(client).toContain("loadIncidentCommandProjection");
    expect(client).toContain("preflightIncidentCommand");
  });
});

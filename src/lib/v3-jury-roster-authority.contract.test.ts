import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = source("supabase/migrations/20261019223000_v3_jury_roster_authority.sql");
const client = source("src/lib/v3-jury-roster.ts");
const registry = source("src/lib/solaris-v6-domain-registry.ts");

function block(start: string, end: string) {
  const from = migration.indexOf(start);
  const to = migration.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return migration.slice(from, to);
}

describe("V3 Jury roster authority", () => {
  it("is an additive S13 forward-fix migration", () => {
    expect(migration).toContain("'v3.s7.jury-roster-authority'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\s+public\.(?:jury_votes|jury_ballot_submissions|jury_ballot_statuses)\b/i);
  });

  it("registers the command and completed-fact event under the canonical Jury owner", () => {
    const juryStart = registry.indexOf('id: "jury"');
    const televoteStart = registry.indexOf('id: "televote"', juryStart);
    expect(juryStart).toBeGreaterThanOrEqual(0);
    expect(televoteStart).toBeGreaterThan(juryStart);
    const jury = registry.slice(juryStart, televoteStart);
    expect(jury).toContain('"jury.roster_change"');
    expect(jury).toContain('"jury.roster_changed"');
    expect(jury).toContain('"direct show-roster voter mutations"');
  });

  it("versions every legacy and V3 voter write during staged cutover", () => {
    expect(migration).toContain("create table if not exists public.studio2_jury_roster_versions");
    expect(migration).toContain("create trigger v3_touch_jury_roster_version");
    expect(migration).toContain("after insert or update or delete on public.voters");
    expect(migration).toContain("version = version_row.version + 1");
  });

  it("binds preview and commit to exact edition/show voting authority", () => {
    const preview = block(
      "create or replace function public.studio2_jury_roster_preview_v3(",
      "revoke all on function public.studio2_jury_roster_preview_v3(",
    );
    const apply = block(
      "create or replace function public.studio2_apply_jury_roster_v3(",
      "revoke all on function public.studio2_apply_jury_roster_v3(",
    );

    for (const rpc of [preview, apply]) {
      expect(rpc).toContain("show_row.id = p_show_id");
      expect(rpc).toContain("show_row.edition_id = p_edition_id");
      expect(rpc).toContain("studio2_access_allowed('voting.manage', p_edition_id, false)");
    }
  });

  it("uses semantic idempotency, a show lock and reviewed optimistic versioning", () => {
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("coalesce(p_correlation_id, p_operation_id)");
    expect(migration).toContain("'expectedVersion', p_expected_version");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("for update;");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain("public.studio2_reconcile_operation(v_operation_id)");
    expect(migration).toContain("private.studio2_complete_operation(v_operation_id, v_result)");
  });

  it("materializes canonical participants and reorders the complete roster atomically", () => {
    expect(migration).toContain("participant.participation_status = 'confirmed'");
    expect(migration).toContain("left join public.contest_entities entity_row");
    expect(migration).toContain("left join public.countries country");
    expect(migration).toContain("jsonb_array_elements_text(p_payload -> 'voterIds')");
    expect(migration).toContain("v_requested_count <> v_before_count");
    expect(migration).toContain("v_distinct_count <> v_requested_count");
  });

  it("makes destructive removal fail closed when any Jury evidence exists", () => {
    expect(migration).toContain("private.v3_jury_roster_evidence");
    expect(migration).toContain("from public.jury_votes vote");
    expect(migration).toContain("from public.jury_ballot_submissions submission");
    expect(migration).toContain("from public.jury_ballot_statuses status_row");
    expect(migration).toContain("message = 'EVIDENCE_EXISTS'");
    expect(migration).toContain("if v_action = 'remove' and v_reason is null");
    expect(migration).toContain("message = 'REASON_REQUIRED'");
  });

  it("records audit evidence and a canonical completed-fact DomainEvent", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("'operationId', v_operation_id");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'jury.roster_changed'");
    expect(migration).toContain("'jury_roster'");
    expect(migration).toContain("'previousVersion', v_current_version");
  });

  it("provides preflight plus a non-retrying command client with one reconciliation path", () => {
    expect(client).toContain('supabase.rpc("studio2_jury_roster_preview_v3"');
    expect(client).toContain('supabase.rpc("studio2_apply_jury_roster_v3"');
    expect(client).toContain("createOrganisationCommand");
    expect(client).toContain('riskClass: "R2"');
    expect(client).toContain("p_expected_version: input.expectedVersion");
    expect(client).toContain("p_operation_id: command.operationId");
    expect(client).toContain("p_idempotency_key: command.idempotencyKey");
    expect(client).toContain('supabase.rpc("studio2_reconcile_operation"');
    expect(client.match(/studio2_apply_jury_roster_v3/g)).toHaveLength(1);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024225500_v3_broadcast_rundown_governed_operations.sql",
  ),
  "utf8",
);

function indexOrFail(fragment: string) {
  const index = migration.indexOf(fragment);
  expect(index, `missing ${fragment}`).toBeGreaterThan(-1);
  return index;
}

describe("V3 governed Broadcast Rundown operations", () => {
  it("registers a forward-only semantic S13 migration contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.broadcast.rundown-governed-operations'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain(
      "'20261024225500_v3_broadcast_rundown_governed_operations'",
    );
  });

  it("adds an exact Edition + Show read projection without newest/current fallback", () => {
    expect(migration).toContain("public.studio2_broadcast_rundown_v3(");
    expect(migration).toContain("v_show_edition_id is distinct from p_edition_id");
    expect(migration).toContain("'broadcast.read', p_edition_id, true");
    expect(migration).toContain("'broadcast.manage', p_edition_id, true");
    expect(migration).toContain("'broadcast.control', p_edition_id, true");
    expect(migration).not.toMatch(/order by[^;]*(edition_number|created_at)[^;]*limit 1/i);
    expect(migration).not.toContain("max(edition_number)");
  });

  it("requires an active authenticated session at the governed boundary", () => {
    expect(migration.match(/private\.v3_require_active_auth_session\(\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("message = 'AUTHENTICATION'");
    expect(migration).not.toContain("p_actor_id");
  });

  it("splits configuration authority from live-control authority", () => {
    expect(migration).toContain("v_capability := 'broadcast.manage'");
    expect(migration).toContain("v_capability := 'broadcast.control'");
    expect(migration).toContain("studio2_access_allowed(v_capability, p_edition_id, true)");
    expect(migration).toContain("'broadcast.rundown.save'");
    expect(migration).toContain("'broadcast.rundown.lock'");
    expect(migration).toContain("'broadcast.rundown.unlock'");
    expect(migration).toContain("'broadcast.segment.' || p_to_status");
  });

  it("uses one private authority pipeline so sibling command semantics cannot drift", () => {
    const applyStart = indexOrFail(
      "create or replace function private.v3_apply_broadcast_rundown_operation(",
    );
    const saveWrapper = indexOrFail(
      "create or replace function public.studio2_save_broadcast_rundown_v3(",
    );
    const body = migration.slice(applyStart, saveWrapper);

    const claim = body.indexOf("private.studio2_claim_operation(");
    const rowLock = body.indexOf("for update;");
    const version = body.indexOf("VERSION_CONFLICT");
    const update = body.indexOf("update public.shows");

    expect(claim).toBeGreaterThan(-1);
    expect(rowLock).toBeGreaterThan(claim);
    expect(version).toBeGreaterThan(rowLock);
    expect(update).toBeGreaterThan(version);
    expect(body.match(/studio2_access_allowed\(v_capability, p_edition_id, true\)/g)?.length).toBe(2);

    expect(migration).toContain(
      "select private.v3_apply_broadcast_rundown_operation(\n    'save'",
    );
    expect(migration).toContain(
      "select private.v3_apply_broadcast_rundown_operation(\n    'lock'",
    );
    expect(migration).toContain(
      "select private.v3_apply_broadcast_rundown_operation(\n    'segment'",
    );
  });

  it("fingerprints the complete reviewed semantic request", () => {
    expect(migration.match(/'expectedRevision', p_expected_revision/g)?.length).toBe(3);
    expect(migration).toContain("'startAt', p_start_at");
    expect(migration).toContain("'segments', p_segments");
    expect(migration).toContain("'locked', p_locked");
    expect(migration).toContain("'segmentId', v_segment_id");
    expect(migration).toContain("'toStatus', p_to_status");
    expect(migration.match(/'reason', v_reason/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("private.v3_broadcast_replayed_result(v_claim)");
    expect(migration).toContain("'replayed', true");
    expect(migration).toContain("'reconciled', true");
    expect(migration).toContain("Reconcile the existing operation");
  });

  it("bounds structure payloads instead of accepting arbitrary browser-sized rundowns", () => {
    expect(migration).toContain("jsonb_array_length(p_segments) > 250");
    expect(migration).toContain("pg_column_size(p_segments) > 65536");
    expect(migration).toContain("private.studio2_validate_rundown_segments(p_segments)");
    expect(migration).toContain("length(v_reason) > 2000");
    expect(migration).toContain("length(v_segment_id) > 160");
  });

  it("keeps valid segment transitions and the single-live invariant server-side", () => {
    expect(migration).toContain("v_from_status = 'planned' and p_to_status in ('ready', 'skipped')");
    expect(migration).toContain("v_from_status = 'ready' and p_to_status in ('live', 'skipped')");
    expect(migration).toContain("v_from_status = 'live' and p_to_status in ('completed', 'skipped')");
    expect(migration).toContain("segment ->> 'status' = 'live'");
    expect(migration).toContain("message = 'STATE_CHANGED'");
  });

  it("preserves the version-2 persisted Rundown contract during client cutover", () => {
    expect(migration.match(/'version', 2/g)?.length).toBe(3);
    expect(migration).not.toContain("'version', 3");
    expect(migration).toContain("compatibility client accepts only 1/2");
  });

  it("returns durable receipt identity and authoritative readback state", () => {
    expect(migration.match(/'receiptId', v_canonical_operation_id/g)?.length).toBe(2);
    expect(migration.match(/'operationId', v_canonical_operation_id/g)?.length).toBe(2);
    expect(migration.match(/'stateVersion'/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration.match(/'serverTime', now\(\)/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("'rundown', v_next");
    expect(migration).toContain("private.studio2_complete_operation(v_canonical_operation_id, v_result)");
  });

  it("correlates audit, legacy contest-event and canonical DomainEvent evidence", () => {
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("insert into public.studio2_contest_events");
    expect(migration).toContain("'operationId', p_operation_id");
    expect(migration).toContain("private.v3_emit_domain_event(");
    expect(migration).toContain("'show.changed'");
    expect(migration).toContain("'live-show'");
    expect(migration).toContain("p_operation_id,");
    expect(migration).toContain("p_revision,");
    expect(migration).toContain("array[]::text[]");
  });

  it("preserves legacy event entity identity for rundown and segment consumers", () => {
    expect(migration).toContain("v_legacy_entity_type text := 'broadcast_rundown'");
    expect(migration).toContain("v_legacy_entity_type := 'broadcast_segment'");
    expect(migration).toContain("v_legacy_entity_id := p_show_id::text || ':' || v_segment_id");
    expect(migration).toContain("v_legacy_event_type := case");
    expect(migration).toContain("'broadcast.segment_started'");
    expect(migration).toContain("'broadcast.segment_completed'");
  });

  it("does not fabricate a DomainEvent for an idempotent lock no-op", () => {
    const noOp = indexOrFail("'changed', false");
    const completeAfterNoOp = migration.indexOf(
      "private.studio2_complete_operation(v_canonical_operation_id, v_result)",
      noOp,
    );
    const recordAfterNoOp = migration.indexOf(
      "private.v3_record_broadcast_rundown_change(",
      noOp,
    );

    expect(completeAfterNoOp).toBeGreaterThan(noOp);
    expect(recordAfterNoOp).toBeGreaterThan(completeAfterNoOp);
  });

  it("keeps new RPC execution authenticated-only while retaining legacy compatibility", () => {
    expect(migration).toContain(
      "grant execute on function public.studio2_broadcast_rundown_v3(uuid, uuid)\n  to authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_save_broadcast_rundown_v3(\n  uuid, uuid, integer, timestamptz, jsonb, text, uuid, text, uuid\n) to authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_set_broadcast_rundown_lock_v3(\n  uuid, uuid, integer, boolean, text, uuid, text, uuid\n) to authenticated;",
    );
    expect(migration).toContain(
      "grant execute on function public.studio2_transition_broadcast_segment_v3(\n  uuid, uuid, integer, text, text, text, uuid, text, uuid\n) to authenticated;",
    );
    expect(migration).not.toContain("to authenticated, service_role");
    expect(migration).not.toContain(
      "drop function if exists public.studio2_save_broadcast_rundown",
    );
    expect(migration).not.toContain(
      "drop function if exists public.studio2_set_broadcast_rundown_lock",
    );
    expect(migration).not.toContain(
      "drop function if exists public.studio2_transition_broadcast_segment",
    );
  });

  it("does not expose a generic Show mutation or bypass canonical operation infrastructure", () => {
    expect(migration).not.toContain("jsonb_populate_record");
    expect(migration).not.toContain("execute format(");
    expect(migration).not.toContain("p_column");
    expect(migration).not.toContain("service_role");
    expect(migration).toContain("private.studio2_claim_operation(");
    expect(migration).toContain("private.studio2_complete_operation(");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});

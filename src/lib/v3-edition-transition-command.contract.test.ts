import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20261017004000_v3_edition_transition_command_v3.sql',
  'utf8',
);

describe('System V3 governed edition lifecycle command', () => {
  it('requires reviewed runtime version and caller-stable operation identity', () => {
    expect(migration).toContain('create or replace function public.studio2_transition_edition_v3(');
    expect(migration).toContain('p_expected_version bigint');
    expect(migration).toContain('p_operation_id uuid');
    expect(migration).toContain('p_idempotency_key text');
    expect(migration).toContain('private.studio2_claim_operation(');
    expect(migration).toContain("'expectedRuntimeVersion', p_expected_version");
    expect(migration).toContain('v_runtime.version is distinct from p_expected_version');
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
    expect(migration).toContain('and version = p_expected_version');
  });

  it('replays only the exact semantic operation without re-executing the transition', () => {
    expect(migration).toContain("'edition.transition'");
    expect(migration).toContain("'approvalRequestId', p_approval_request_id");
    expect(migration).toContain("if v_claim ->> 'status' = 'succeeded'");
    expect(migration).toContain("jsonb_build_object('replayed', true)");
    expect(migration).toContain('private.studio2_complete_operation(p_operation_id, v_result)');
    expect(migration).toContain("'replayed', false");
  });

  it('preserves exact capability and two-person critical-transition enforcement', () => {
    expect(migration).toContain("when p_to = 'archived' then 'edition.archive'");
    expect(migration).toContain("else 'edition.manage'");
    expect(migration).toContain('public.studio2_access_allowed(v_required_capability, p_edition_id, false)');
    expect(migration).toContain("if v_risk = 'critical' then");
    expect(migration).toContain('v_approval.approved_by = v_actor');
    expect(migration).toContain('v_approval.consumed_at is not null');
    expect(migration).toContain('v_approval.reason <> v_reason');
    expect(migration).toContain('set consumed_at = now()');
  });

  it('returns authoritative receipt data and emits operation-linked audit/domain evidence', () => {
    for (const field of [
      "'operationId', p_operation_id",
      "'editionId', p_edition_id",
      "'from', v_from",
      "'previousRuntimeVersion', p_expected_version",
      "'state', v_runtime.state",
      "'runtimeVersion', v_runtime.version",
      "'serverTime', v_server_time",
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("'edition.state_changed'");
    expect(migration).toContain('private.v3_emit_domain_event(');
    expect(migration).toContain("'lifecycleAuthority', 'studio2_edition_runtime'");
  });

  it('keeps Archive consequences on the same governed transition operation', () => {
    expect(migration).toContain("if p_to = 'archived' then");
    expect(migration).toContain("set_config('solaris.v3_archive_command', 'allowed', true)");
    expect(migration).toContain("'edition.archived'");
    expect(migration).toContain("array['edition.tasks']::text[]");
  });

  it('retires older browser-callable lifecycle mutation paths', () => {
    expect(migration).toContain(
      'revoke all on function public.studio2_transition_edition_v2(uuid, text, text, uuid)',
    );
    expect(migration).toContain(
      'revoke all on function public.studio2_archive_edition_v3(uuid, bigint, uuid, text, text)',
    );
    expect(migration).toContain('from public, anon, authenticated');
    expect(migration).toContain(
      'grant execute on function public.studio2_transition_edition_v3(',
    );
    expect(migration).toContain('to authenticated, service_role');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const nav = source('src/components/admin/AdminNav.tsx');
const route = source('src/routes/_authenticated/admin/results.tsx');
const service = source('src/lib/studio2-results-operations.ts');
const migration = source('supabase/migrations/20260912154500_studio2_results_operations.sql');
const publishedGuard = source('supabase/migrations/20260912154600_studio2_results_published_guard.sql');

describe('Studio 2 Phase 10 results operations', () => {
  it('adds one organizer results control plane and keeps specialist systems authoritative', () => {
    expect(nav).toContain('label: "Results"');
    expect(nav).toContain('to: "/admin/results"');
    expect(route).toContain("createFileRoute('/_authenticated/admin/results')");
    expect(route).toContain('/televoting/admin/result-integrity');
    expect(route).toContain('/admin/friend-voting');
    expect(route).toContain('/admin/jury-integrity');
    expect(route).toContain('/admin/results-reveal');
    expect(route).toContain('/admin/publication/');
    expect(route).toContain('Integrity flags never alter results automatically.');
  });

  it('stores only organizer operations metadata instead of creating a second scoring store', () => {
    expect(migration).toContain('create table if not exists public.studio2_result_operations');
    expect(migration).toContain('create table if not exists public.studio2_result_operation_executions');
    expect(migration).not.toContain('create table if not exists public.studio2_results');
    expect(migration).not.toContain('create table if not exists public.studio2_jury_votes');
    expect(migration).not.toContain('create table if not exists public.studio2_televote_votes');
    expect(migration).toContain('public.materialize_show_results_if_missing');
    expect(migration).toContain('public.recalculate_show_results_internal');
  });

  it('derives readiness once on the server and honors disabled voting halves', () => {
    expect(migration).toContain('private.studio2_result_preconditions');
    expect(migration).toContain("v_config ->> 'juryEnabled'");
    expect(migration).toContain("v_config ->> 'televoteEnabled'");
    expect(migration).toContain("bs.status = 'did_not_vote'");
    expect(migration).toContain('v_jury_conflicts = 0');
    expect(migration).toContain('v_reconcile_issues = 0');
    expect(route).not.toContain("from('jury_votes')");
    expect(route).not.toContain("from('televote_votes')");
    expect(route).not.toContain("from('results')");
  });

  it('enforces permissions, locking, stale-version protection and idempotent execution server-side', () => {
    expect(migration).toContain("'results.preview'");
    expect(migration).toContain("'results.verify'");
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('execution_id uuid not null unique');
    expect(migration).toContain('p_expected_version <> v_ops.calculation_version');
    expect(migration).toContain("using errcode = '40001'");
    expect(service).toContain('p_execution_id: input.executionId');
    expect(service).toContain('p_expected_version: input.expectedVersion');
    expect(route).toContain('crypto.randomUUID()');
  });

  it('invalidates approvals when numbers change and requires review before lock and lock before reveal', () => {
    expect(migration).toContain('set calculation_version = calculation_version + 1');
    expect(migration).toContain('reviewed_version = null');
    expect(migration).toContain('locked_version = null');
    expect(migration).toContain('reveal_ready_version = null');
    expect(migration).toContain('Review the current calculation version before locking it.');
    expect(migration).toContain('Lock the current result version before marking it reveal ready.');
    expect(service).toContain("row.reviewedVersion === version");
    expect(service).toContain("row.lockedVersion === version");
  });

  it('makes published results terminal in both UI availability and the database', () => {
    expect(service).toContain('if (pre.publishedResults) return actions;');
    expect(publishedGuard).toContain('private.studio2_guard_published_result_operation_update');
    expect(publishedGuard).toContain('if v_published and new is distinct from old then');
    expect(publishedGuard).toContain('Make the published result layer private before changing result operations.');
    expect(publishedGuard).toContain('before update on public.studio2_result_operations');
    expect(migration).toContain('Make the published result layer private before recalculating.');
    expect(migration).toContain('Make the published result layer private before unlocking results.');
    expect(migration).toContain('Make the published result layer private before clearing reveal readiness.');
    expect(route).toContain('/admin/publication/');
    expect(migration).not.toContain('update public.shows');
  });

  it('keeps tables private and writes immutable audit receipts plus canonical contest events', () => {
    expect(migration).toContain('revoke all on table public.studio2_result_operations from public, anon, authenticated');
    expect(migration).toContain('revoke all on table public.studio2_result_operation_executions from public, anon, authenticated');
    expect(migration).toContain('insert into public.studio2_result_operation_executions');
    expect(migration).toContain('insert into public.studio2_contest_events');
    expect(migration).toContain("'changeKind', 'results.operation'");
    expect(migration).toContain("v_event_type := 'results.calculated'");
    expect(migration).not.toContain('studio2_contest_events_type_check');
  });

  it('requires explicit human confirmation and an audit reason in the organizer UI', () => {
    expect(route).toContain('AdminConfirmSheet');
    expect(route).toContain('confirmationText={pending?.row.showName}');
    expect(route).toContain('Audit reason');
    expect(route).toContain('reason.trim().length < 5');
    expect(service).toContain("reason.length < 5");
  });
});

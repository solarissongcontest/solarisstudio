import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const migration = source('supabase/migrations/20260912171500_studio2_host_management.sql');
const route = source('src/routes/_authenticated/admin/hosts.tsx');
const service = source('src/lib/studio2-host-management.ts');
const nav = source('src/components/admin/AdminNav.tsx');
const permissions = source('src/lib/permissions-v2.ts');
const presets = source('src/lib/role-presets.ts');

describe('Studio 2 Phase 11 Host Management architecture', () => {
  it('adds an audited host domain without duplicating canonical public host fields', () => {
    expect(migration).toContain('create table if not exists public.studio2_host_bids');
    expect(migration).toContain('create table if not exists public.studio2_host_bid_evaluations');
    expect(migration).toContain('create table if not exists public.studio2_host_operations');
    expect(migration).toContain('create table if not exists public.studio2_host_operation_executions');
    expect(migration).toContain('update public.editions');
    expect(migration).toContain('set host_country_id = v_bid.country_id');
    expect(migration).toContain('update public.shows');
    expect(migration).not.toContain('create table if not exists public.studio2_hosts');
  });

  it('enforces one selected host and a controlled bid lifecycle', () => {
    expect(migration).toContain('studio2_host_bids_one_selected_per_edition_idx');
    expect(migration).toContain("where status = 'selected'");
    expect(migration).toContain("'draft', 'submitted', 'eligible', 'shortlisted', 'selected', 'rejected', 'withdrawn', 'superseded'");
    expect(migration).toContain("Only eligible or shortlisted host bids can be selected");
    expect(migration).toContain("set status = 'superseded'");
    expect(service).toContain("case 'selected':");
    expect(service).toContain("case 'superseded':");
  });

  it('keeps selection human-controlled instead of deriving it from evaluation scores', () => {
    expect(migration).toContain("p_action = 'evaluate_bid'");
    expect(migration).toContain("p_action = 'select_bid'");
    expect(migration).not.toContain('order by avg(score)');
    expect(route).toContain('They never select or reject a host automatically');
    expect(route).toContain('The final selection is always an explicit organizer decision');
  });

  it('adds host.read and host.manage to persisted and client authorization contracts', () => {
    expect(migration).toContain("'host.read', 'host.manage'");
    expect(migration).toContain('private.studio2_can_read_host');
    expect(migration).toContain('private.studio2_can_manage_host');
    expect(permissions).toContain("'host.read'");
    expect(permissions).toContain("'host.manage'");
    expect(presets).toContain("'host.manage'");
  });

  it('uses server-side locking, revision checks and execution idempotency', () => {
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('execution_id uuid not null unique');
    expect(migration).toContain('Host bid changed since this action was loaded. Refresh before continuing.');
    expect(migration).toContain('Host operations changed since this action was loaded. Refresh before continuing.');
    expect(migration).toContain("jsonb_build_object('idempotentReplay', true)");
    expect(service).toContain('p_expected_revision: input.expectedRevision ?? null');
    expect(route).toContain('crypto.randomUUID()');
  });

  it('writes immutable receipts and canonical Studio 2 events for every host mutation', () => {
    expect(migration).toContain('insert into public.studio2_host_operation_executions');
    expect(migration).toContain('insert into public.studio2_contest_events');
    expect(migration).toContain("'changeKind', 'host.' || p_action");
    expect(migration).toContain("'rule.changed'");
    expect(route).toContain('Stored with the immutable operation receipt and Studio 2 contest event.');
  });

  it('keeps lifecycle tables RPC-only in the browser', () => {
    expect(migration).toContain('revoke all on table public.studio2_host_bids from public, anon, authenticated');
    expect(migration).toContain('revoke all on table public.studio2_host_bid_evaluations from public, anon, authenticated');
    expect(migration).toContain('revoke all on table public.studio2_host_operations from public, anon, authenticated');
    expect(route).not.toContain('supabase.from(');
    expect(service).toContain("rpc('studio2_host_management_snapshot'");
    expect(service).toContain("rpc('studio2_execute_host_operation'");
  });

  it('promotes Host Management into the current-edition navigation', () => {
    expect(nav).toContain('label: "Host"');
    expect(nav).toContain('to: "/admin/hosts"');
    expect(nav).not.toContain('path.startsWith("/admin/hosts") ||\n        path.startsWith("/admin/predictions")');
  });

  it('covers bids, comparison, selected host, operational readiness and split-host show assignments in one control plane', () => {
    expect(route).toContain("{ id: 'bids', label: 'Bids' }");
    expect(route).toContain("{ id: 'evaluation', label: 'Evaluation' }");
    expect(route).toContain("{ id: 'selected', label: 'Selected host' }");
    expect(route).toContain("{ id: 'operations', label: 'Operations' }");
    expect(route).toContain('Use selected host for every show');
    expect(route).toContain('Leave both fields empty to inherit the edition-level selected host');
    expect(migration).toContain("p_action = 'set_show_host'");
    expect(migration).toContain("p_action in ('update_operations', 'set_show_host', 'sync_show_hosts')");
  });
});

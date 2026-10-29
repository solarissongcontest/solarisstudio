import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const sql = readFileSync('supabase/migrations/20261029070858_v3_combined_source_authority.sql', 'utf8');
const source = readFileSync('src/integrations/televoting/combined.server.ts', 'utf8');
const family = source.split('async function mutateCombinedSource')[1].split('export async function recalculateMergedCombinedServer')[0];
const ui = readFileSync('src/routes/televoting/admin/combined.tsx', 'utf8');
describe('Combined source management authority', () => {
  it('routes every source and participant branch through one authority', () => {
    for (const action of ['participants', 'source', 'delete_source', 'values']) expect(family).toContain(`"${action}"`);
    expect(family).toContain('.rpc("v3_manage_combined_sources"');
    for (const verb of ['.insert(', '.update(', '.delete(', '.upsert(']) expect(family).not.toContain(verb);
  });
  it('checks live session and scope before replay and replay before CAS', () => {
    expect(sql.indexOf('private.v3_require_active_auth_session')).toBeLessThan(sql.indexOf('private.studio2_claim_operation'));
    expect(sql.indexOf('private.studio2_user_has_capability')).toBeLessThan(sql.indexOf('private.studio2_claim_operation'));
    expect(sql.indexOf("v_claim->>'replayed'")).toBeLessThan(sql.indexOf('a.command_version<>p_expected_version'));
    expect(sql).toContain("a.status not in ('draft','calculated')");
    expect(sql).toContain("'payload',p_payload,'expectedVersion',p_expected_version");
  });
  it('validates ownership before deleting scores and forbids manual edits of linked rounds', () => {
    expect(sql.indexOf('Source scope mismatch')).toBeLessThan(sql.indexOf('delete from televoting.external_score_entries'));
    expect(sql).toContain('Linked round scores cannot be edited manually');
    expect(sql).toContain('Correction scope mismatch');
    expect(sql).toContain('Participants are managed by the linked Solaris show');
  });
  it('commits invalidation, event and receipt in the same transaction without swallowing failure', () => {
    expect(sql).toContain('results_outdated=true');
    expect(sql).toContain('combined.inputs_changed');
    expect(sql).toContain('private.studio2_complete_operation(p_operation_id,v_result)');
    expect(sql).not.toContain('exception when');
    expect(sql).toContain('from public,anon,service_role');
  });
  it('retains the original reviewed request for retry until acknowledged', () => {
    expect(ui).toContain('expectedVersion: detail.aggregation.command_version');
    expect(ui).toContain('pending.fingerprint !== fingerprint');
    expect(ui.indexOf('await fn({ data: pending.data })')).toBeLessThan(ui.indexOf('pendingSources.current.delete(key)'));
  });
});

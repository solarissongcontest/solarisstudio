import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/feature-rollout.tsx');

describe('V3 Organizer feature rollout review boundary', () => {
  it('reviews live rollout changes instead of mutating from the row button', () => {
    expect(route).toContain('<AdminConfirmSheet');
    expect(route).toContain('prepareRolloutReview(row)');
    expect(route).toContain("confirmLabel={pendingReview?.nextEnabled ? 'Enable reviewed feature' : 'Disable reviewed feature'}");
    expect(route).toContain('confirmationText={pendingReview?.surfaceLabel}');
    expect(route).not.toContain('onToggle={() => toggleFlag.mutate({ row, enabled: !row.enabled })}');
  });

  it('freezes the complete reviewed flag revision and audience scope', () => {
    expect(route).toContain('baseline: cloneFlagRow(row)');
    expect(route).toContain('nextEnabled: !row.enabled');
    expect(route).toContain('user_ids: [...row.user_ids]');
    expect(route).toContain('edition_ids: [...row.edition_ids]');
    expect(route).toContain('live.updated_at === baseline.updated_at');
    expect(route).toContain('sameStringList(live.user_ids, baseline.user_ids)');
    expect(route).toContain('sameStringList(live.edition_ids, baseline.edition_ids)');
  });

  it('re-reads rollout state and recomputes dependency legality immediately before apply', () => {
    expect(route).toContain('const freshRows = await loadFlags()');
    expect(route).toContain('const live = freshRows.find((row) => row.key === pending.baseline.key) ?? null');
    expect(route).toContain('!sameFlagSnapshot(live, pending.baseline)');
    expect(route).toContain('return setFlag(live, pending.nextEnabled, freshRows)');
    expect(route).toContain('const decision = studio2RolloutDecision(row.key, row.enabled, enabledKeys)');
    expect(route).toContain('changed while this review was open. Nothing was intentionally changed');
  });

  it('refreshes canonical rollout state after success and after uncertain failures', () => {
    expect(route).toContain("onSuccess: async () => {");
    expect(route).toContain("onError: async () => {");
    expect(route.match(/invalidateQueries\(\{ queryKey: \['studio2-feature-flags-admin'\] \}\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(route.match(/invalidateQueries\(\{ queryKey: \['studio2-feature'\] \}\)/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves the existing authoritative RPC and states the missing System command contract', () => {
    expect(route.match(/client\.rpc\('studio2_set_feature_flag'/g)?.length).toBe(1);
    expect(route).toContain('System #1178 owns that canonical command gap');
    expect(route).toContain('does not accept the reviewed revision, idempotency identity, or return a durable operation receipt');
    expect(route).toContain('narrow read-to-RPC race and ambiguous network outcome remain until it lands');
  });
});
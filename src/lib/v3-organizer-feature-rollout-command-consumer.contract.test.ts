import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(
  resolve(process.cwd(), 'src/routes/_authenticated/admin/feature-rollout.tsx'),
  'utf8',
);
const adapter = readFileSync(
  resolve(process.cwd(), 'src/lib/admin-feature-rollout.functions.ts'),
  'utf8',
);

describe('V3 Organizer Feature Rollout command consumer', () => {
  it('binds the review to the canonical monotonic feature revision', () => {
    expect(route).toContain(".select('key,enabled,admins_only,user_ids,edition_ids,revision,updated_at')");
    expect(route).toContain('revision: Number.isSafeInteger(Number(row.revision))');
    expect(route).toContain('previewFeatureRolloutChange');
    expect(route).toContain('preview.currentRevision !== live.revision');
    expect(route).toContain('expectedRevision: preview.currentRevision');
    expect(route).toContain('Canonical revision: {pending.expectedRevision}');
  });

  it('uses one operation identity for the reviewed command and every retry or reconciliation', () => {
    expect(route).toContain('operationId: crypto.randomUUID()');
    expect(route).toContain('operationId: pending.operationId');
    expect(route).toContain("unconfirmedOutcome");
    expect(route).toContain("'Reconcile reviewed operation'");
    expect(route).toContain('This review remains locked to operation');
    expect(adapter).toContain('const recovered = await reconcileKnownOperation(client, data.operationId)');
    expect(adapter).toContain("p_idempotency_key: `rollout.change:${data.operationId}`");
    expect(adapter).toContain('p_correlation_id: data.operationId');
  });

  it('rechecks dependency legality server-side immediately before a genuinely new apply', () => {
    expect(adapter).toContain(".from('studio2_feature_flags')");
    expect(adapter).toContain(".select('key,enabled')");
    expect(adapter).toContain('assertDependencyPreflight(');
    expect(adapter).toContain('studio2RolloutDecision(key, currentEnabled, enabledKeys)');
  });

  it('applies only through the canonical versioned rollout command', () => {
    expect(adapter).toContain("client.rpc('studio2_feature_flag_change_preview'");
    expect(adapter).toContain("client.rpc('studio2_apply_feature_flag_change'");
    expect(adapter).toContain('p_expected_revision: data.expectedRevision');
    expect(route).not.toContain("client.rpc('studio2_set_feature_flag'");
    expect(route).not.toContain('studio2_set_feature_flag');
  });

  it('reconciles an ambiguous apply before allowing another rollout operation', () => {
    const firstReconcile = adapter.indexOf(
      'const recovered = await reconcileKnownOperation(client, data.operationId)',
    );
    const canonicalApply = adapter.indexOf("client.rpc('studio2_apply_feature_flag_change'");
    expect(firstReconcile).toBeGreaterThan(-1);
    expect(canonicalApply).toBeGreaterThan(firstReconcile);
    expect(adapter).toContain('const reconciled = await reconcileKnownOperation(client, data.operationId)');
    expect(adapter).toContain("status: 'unconfirmed'");
    expect(adapter).toContain('Solaris could not confirm operation');
    expect(route).toContain("if (outcome.status === 'unconfirmed')");
    expect(route).toContain('if (!toggleFlag.isPending && !unconfirmedOutcome) setPendingReview(null)');
  });

  it('keeps the reviewed operation locked after transport-level errors instead of fabricating success', () => {
    expect(route).toContain("setReviewError(messageFor(error, 'Could not apply the reviewed rollout operation.'))");
    expect(route).toContain('Keep the reviewed operation intact');
    expect(route).not.toContain('setPendingReview(null);\n      setReviewError(messageFor(error');
    expect(adapter).toContain("envelope.status !== 'succeeded'");
  });

  it('does not claim parity or change backend authority in the Organizer slice', () => {
    expect(route).toContain('Reviewed revisions and stable operation receipts fail closed on rollout-state drift.');
    expect(adapter).toContain('createSolarisAuthenticatedClientServer');
    expect(adapter).toContain('requireSolarisOrganizerServer');
    expect(adapter).not.toContain('service_role');
  });
});
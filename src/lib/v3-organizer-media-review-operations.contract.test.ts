import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const organizer = source('src/lib/v3-organizer-media-review-operations.ts');
const system = source('src/lib/studio2-media-review-command.ts');

describe('V3 Organizer Media Review operation boundary', () => {
  it('delegates command transport and reconciliation to the canonical System client', () => {
    expect(organizer).toContain("from '@/lib/studio2-media-review-command'");
    expect(organizer).not.toContain('integrations/supabase');
    expect(organizer).not.toContain('.rpc(');
    expect(system).toContain("'studio2_review_media_assets_v3'");
    expect(system).toContain("'studio2_reconcile_operation'");
  });

  it('creates one operation and idempotency identity when the Organizer review opens', () => {
    expect(organizer).toContain('createMediaReviewOperationIdentity()');
    expect(organizer).toContain('operationId: identity.operationId');
    expect(organizer).toContain('idempotencyKey: identity.idempotencyKey');
  });

  it('freezes exact media identity and source fingerprints', () => {
    expect(organizer).toContain('sourceFingerprint = review.sourceFingerprint.trim()');
    expect(organizer).toContain('seen.has(assetKey)');
    expect(organizer).toContain('left.sourceFingerprint === right.sourceFingerprint');
    expect(organizer).toContain('left.decision === right.decision');
  });

  it('fails closed when edition or reviewed asset state changes before commit', () => {
    expect(organizer).toContain('currentEditionId !== input.review.editionId');
    expect(organizer).toContain('assertSameReviewedSet(input.review.reviews, currentReviews)');
    expect(organizer).toContain('Media Review selection changed after review');
    expect(organizer).toContain('A media source changed after review');
  });

  it('passes the reviewed operation identity unchanged to System', () => {
    expect(organizer).toContain('operationId: input.review.operationId');
    expect(organizer).toContain('idempotencyKey: input.review.idempotencyKey');
    expect(system).toContain('p_operation_id: input.operationId');
    expect(system).toContain('p_idempotency_key: input.idempotencyKey');
  });

  it('accepts settlement only for the reviewed operation and edition', () => {
    expect(organizer).toContain('receipt.operationId !== input.review.operationId');
    expect(organizer).toContain('receipt.receiptId !== input.review.operationId');
    expect(organizer).toContain('receipt.editionId !== input.review.editionId');
  });

  it('keeps System lost-response handling bounded to the original operation', () => {
    expect(system).toContain('reconcileMediaReview(input.operationId, input.editionId)');
    expect(system).toContain("reconciliation.command !== 'media.review'");
    expect(system).toContain("reconciliation.status !== 'succeeded'");
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/media-assets.tsx');
const organizer = source('src/lib/v3-organizer-media-review-operations.ts');

describe('V3 Organizer exact-source media review preview', () => {
  it('opens a review instead of applying bulk approval or invalidation from the list controls', () => {
    expect(route).toContain("onClick={() => requestReview('approved')}");
    expect(route).toContain("onClick={() => requestReview('invalid')}");
    expect(route).toContain('AdminConfirmSheet');
    expect(route).not.toContain("onClick={() => reviewMutation.mutate({ decision: 'approved'");
    expect(route).not.toContain("onClick={() => reviewMutation.mutate({ decision: 'invalid'");
  });

  it('captures exact edition, reason, asset keys and source fingerprints in one reviewed operation', () => {
    expect(route).toContain('prepareOrganizerMediaReviewOperation({');
    expect(route).toContain('editionId: selectedEdition.id');
    expect(route).toContain('reason: reviewReason');
    expect(route).toContain('assetKey: item.assetKey');
    expect(route).toContain('sourceFingerprint: item.sourceFingerprint');
    expect(route).toContain('Source fingerprint: {item.sourceFingerprint}');
    expect(organizer).toContain('createMediaReviewOperationIdentity()');
  });

  it('fails closed when a reviewed source changes before apply', () => {
    expect(route).toContain('current.sourceFingerprint !== reviewed.sourceFingerprint');
    expect(route).toContain('changed after this review opened. Review the replacement source instead.');
    expect(route).toContain('current.processing');
    expect(route).toContain('current.editionId !== review.commandEditionId');
    expect(route).toContain('commitOrganizerMediaReviewOperation({');
  });

  it('rechecks blockers before approving and preserves invalidation as an audited overlay', () => {
    expect(route).toContain("review.decision === 'approved' && current.validation.some");
    expect(route).toContain('commitOrganizerMediaReviewOperation');
    expect(route).toContain('This decision is an audited review overlay.');
    expect(route).toContain('does not delete, replace or rewrite the canonical media source');
  });

  it('shows that the reviewed command has durable operation identity and recovery semantics', () => {
    expect(route).toContain('pendingReview.operation.operationId');
    expect(route).toContain('A lost response is reconciled against that same operation before Solaris reports failure.');
    expect(organizer).toContain('operationId: input.review.operationId');
    expect(organizer).toContain('idempotencyKey: input.review.idempotencyKey');
  });

  it('clears pending review when Organizer edition context changes', () => {
    expect(route).toContain('setPendingReview(null)');
    expect(route).toContain('}, [resolvedEditionId]);');
  });
});
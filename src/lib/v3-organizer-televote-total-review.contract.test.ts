import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/televote/$slug.tsx');

describe('V3 Organizer Televote total review boundary', () => {
  it('always opens an explicit review for official aggregate-total changes', () => {
    expect(route).toContain('onClick={() => void requestSave()}');
    expect(route).toContain('setPendingReview({');
    expect(route).toContain('const reviewedChanges = changes.map((change) => ({');
    expect(route).not.toContain('requiresConfirmation');
    expect(route).not.toContain('else void saveChanges()');
  });

  it('freezes the exact reviewed show, lineup and before-to-after values', () => {
    expect(route).toContain('editionId: commandEditionId');
    expect(route).toContain('showId: selectedShow.id');
    expect(route).toContain('snapshot,');
    expect(route).toContain('operationId: command.operationId');
    expect(route).toContain('participantId: change.participantId');
    expect(route).toContain('{change.saved} → <strong className="text-foreground">{change.points}</strong>');
  });

  it('reads the canonical snapshot before freezing the review and rejects protected or stale totals', () => {
    expect(route).toContain('const snapshot = await getTelevoteAggregateSnapshot({');
    expect(route).toContain('publishedResults || snapshot.resultsProtected');
    expect(route).toContain('canonicalSaved !== change.saved');
    expect(route.indexOf('const snapshot = await getTelevoteAggregateSnapshot')).toBeLessThan(route.indexOf('setPendingReview({'));
  });

  it('applies the frozen batch through one scoped CAS operation instead of raw table writes', () => {
    expect(route).toContain('const commandEditionId = assertTelevoteEditionScope(review)');
    expect(route).toContain('await applyTelevoteAggregateCommand({');
    for (const field of ['showId: review.showId', 'snapshot: review.snapshot', 'changes: review.changes.map', 'operationId: review.operationId', 'idempotencyKey: review.idempotencyKey']) expect(route).toContain(field);
    expect(route).not.toMatch(/\.from\("televote_votes"\)\s*\.(?:update|insert|upsert|delete)/);
    const sql = source('supabase/migrations/20261027195000_v3_s16_televote_aggregate_authority.sql');
    expect(sql).toContain('v_current_version is distinct from p_expected_version');
    expect(sql).toContain('v_current_hash is distinct from p_expected_state_hash');
    expect(sql).toContain('for update;');
  });

  it('clears stale reviews on Organizer context changes and requires exact show-name typing', () => {
    expect(route).toContain('}, [organizerEditionId, edition?.id, selectedShow?.id]);');
    expect(route).toContain('confirmationText={pendingReview?.showName}');
    expect(route).toContain('Type ${pendingReview.showName} to confirm');
  });

  it('states atomic commit and exact operation reconciliation after response loss', () => {
    expect(route).toContain('The whole batch commits atomically');
    expect(route).toContain('reconciles this exact operation receipt');
    const command = source('src/lib/studio2-televote-aggregate.ts');
    expect(command).toContain('studio2_reconcile_operation');
    expect(command).toContain('studio2_update_televote_aggregate_totals');
    expect(route).not.toContain('sequential and non-atomic');
  });
});

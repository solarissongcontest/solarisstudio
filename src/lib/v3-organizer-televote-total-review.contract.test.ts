import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const route = source('src/routes/_authenticated/admin/televote/$slug.tsx');

describe('V3 Organizer Televote total review boundary', () => {
  it('always opens an explicit review for official aggregate-total changes', () => {
    expect(route).toContain('onClick={requestSave}');
    expect(route).toContain('setPendingReview({');
    expect(route).toContain('changes: changes.map((change) => {');
    expect(route).not.toContain('requiresConfirmation');
    expect(route).not.toContain('else void saveChanges()');
  });

  it('freezes the exact reviewed show, lineup and before-to-after values', () => {
    expect(route).toContain('editionId: edition.id');
    expect(route).toContain('showId: selectedShow.id');
    expect(route).toContain('participantIds: participants.map((participant) => participant.id)');
    expect(route).toContain('existingId: existing?.id ?? null');
    expect(route).toContain('identity: identityFor(change.key)');
    expect(route).toContain('{change.saved} → <strong className="text-foreground">{change.points}</strong>');
  });

  it('re-reads authoritative show, lineup and totals before the first mutation', () => {
    expect(route).toContain('.from("shows")');
    expect(route).toContain('.from("participants")');
    expect(route).toContain('.from("televote_votes")');
    expect(route).toContain('if (!sameIdSet(review.participantIds, liveParticipantIds))');
    expect(route).toContain('livePublishedResults !== review.publishedResults');
    expect(route).toContain('liveExisting.points !== change.saved');
    expect(route.indexOf('const [showResult, participantResult, voteResult]')).toBeLessThan(route.indexOf('mutationPhaseStarted = true'));
  });

  it('applies only the frozen reviewed batch with exact scope and expected-value guards', () => {
    expect(route).toContain('for (const change of review.changes)');
    expect(route).toContain('.eq("edition_id", commandEditionId)');
    expect(route).toContain('.eq("show_id", review.showId)');
    expect(route).toContain('.eq("points", change.saved)');
    expect(route).toContain('review?.editionId ?? organizerEditionId');
    expect(route).not.toContain('for (const change of changes) {\n        const existing = voteFor(change.key);');
  });

  it('clears stale reviews on Organizer context changes and requires exact show-name typing', () => {
    expect(route).toContain('}, [organizerEditionId, edition?.id, selectedShow?.id]);');
    expect(route).toContain('confirmationText={pendingReview?.showName}');
    expect(route).toContain('Type ${pendingReview.showName} to confirm');
  });

  it('does not pretend the compatibility writer is atomic or has a receipt', () => {
    expect(route).toContain('this compatibility writer is still sequential and non-atomic');
    expect(route).toContain('System #585 owns the canonical atomic, versioned, idempotent Televote-total command and receipt');
    expect(route).toContain('one or more earlier rows may already have committed');
    expect(route).toContain('refresh canonical state before retrying');
  });
});

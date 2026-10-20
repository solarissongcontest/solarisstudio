import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from './v3-organizer-capability-registry';

const route = readFileSync(
  resolve(process.cwd(), 'src/routes/_authenticated/admin/communications.tsx'),
  'utf8',
);

describe('V3 Organizer Communications frozen review integration', () => {
  it('remounts Communications when shell-owned edition context changes', () => {
    expect(route).toContain("return <CommunicationsCentre key={editionId || 'unscoped'} />");
  });

  it('prepares schedule and publish review snapshots instead of opening boolean confirmation state', () => {
    expect(route).toContain("requestPublicationReview('schedule')");
    expect(route).toContain("requestPublicationReview('publish')");
    expect(route).toContain('prepareCommunicationPublicationReview({');
    expect(route).not.toContain('setScheduleReviewOpen(true)');
    expect(route).not.toContain('setPublishReviewOpen(true)');
  });

  it('re-reads the canonical notice before applying a reviewed publication action', () => {
    expect(route).toContain('const latest = await noticesQuery.refetch()');
    expect(route).toContain('assertCommunicationPublicationReviewCurrent(review, editionId, currentNotice)');
    expect(route).toContain('updateStudio2NoticeDraft(review.noticeId, review.input)');
    expect(route).toContain('createStudio2NoticeDraft(review.input)');
    expect(route).toContain('scheduleStudio2Notice(draft.id, review.scheduledAtIso)');
  });

  it('renders the confirmation surface from frozen reviewed input', () => {
    expect(route).toContain('const reviewedInput = publicationReview?.input ?? null');
    expect(route).toContain("open={publicationReview?.kind === 'schedule'}");
    expect(route).toContain("open={publicationReview?.kind === 'publish'}");
    expect(route).toContain('{reviewedInput.title.trim()');
    expect(route).toContain('{reviewedInput.body.trim()}');
    expect(route).toContain('reviewedInput.displaySurfaces.map(noticeSurfaceLabel)');
  });

  it('revalidates destructive lifecycle reviews against current edition, revision and state', () => {
    expect(route).toContain('currentNotice.revision !== lifecycleReview.notice.revision');
    expect(route).toContain('currentNotice.state !== lifecycleReview.notice.state');
    expect(route).toContain('currentNotice.archivedAt !== lifecycleReview.notice.archivedAt');
    expect(route).toContain('The communication changed after this action was reviewed.');
  });

  it('keeps O10 building until the System #599 command boundary exists', () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === 'operations-communications',
    );
    expect(capability?.migrationStatus).toBe('building');
    expect(route).toContain('System #599 still owns the final atomic');
  });
});

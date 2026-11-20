import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync(
  'src/routes/_authenticated/admin/storytelling.tsx',
  'utf8',
);
const operations = readFileSync('src/lib/studio2-storytelling.ts', 'utf8');

describe('V3 Organizer Storytelling publication review', () => {
  it('freezes exact Organizer context, storyline state and audit reason before review', () => {
    expect(route).toContain('type PublicationReview = {');
    expect(route).toContain('function openPublicationReview(action: PublicationAction)');
    expect(route).toContain('editionId: edition.id,');
    expect(route).toContain('editionLabel: editionLabel(edition),');
    expect(route).toContain('storylineId: story.id,');
    expect(route).toContain('storylineTitle: story.title,');
    expect(route).toContain('revision: story.revision,');
    expect(route).toContain('status: story.status,');
    expect(route).toContain('reason: auditReason.trim(),');
    expect(route).toContain("openPublicationReview('publish_storyline')");
    expect(route).toContain("openPublicationReview('unpublish_storyline')");
    expect(route).not.toContain('setConfirmAction(');
  });

  it('fails closed when edition or storyline state drifts during review', () => {
    expect(route).toContain('review.editionId !== resolvedEditionId');
    expect(route).toContain('review.editionId !== editionId');
    expect(route).toContain('review.editionLabel !== editionLabel(edition)');
    expect(route).toContain('review.storylineId !== story.id');
    expect(route).toContain('review.revision !== story.revision');
    expect(route).toContain('review.status !== story.status');
    expect(route).toContain('story.status !== expectedStatus');
    expect(route).toContain(
      'Storytelling changed while this publication action was being reviewed. Reopen review from the current edition and storyline revision.',
    );
    expect(route).toContain('setPublicationReview(null);');
  });

  it('commits the frozen revision and reason through the existing authoritative operation path', () => {
    expect(route).toContain('action: review.action,');
    expect(route).toContain('expectedRevision: review.revision,');
    expect(route).toContain('reason: review.reason,');
    expect(route).toContain('executeStudio2StoryOperation({');
    expect(operations).toContain('expectedRevision: input.expectedRevision ?? null,');
    expect(operations).toContain('const pendingStoryExecutionIds = new Map<string, string>();');
    expect(operations).toContain('executionIdForStoryOperation(fingerprint');
  });

  it('repeats reviewed scope, version, consequence and audit reason in the confirmation surface', () => {
    expect(route).toContain('data-v3-organizer-story-publication-review');
    expect(route).toContain('{publicationReview.editionLabel}');
    expect(route).toContain('Revision {publicationReview.revision}');
    expect(route).toContain('Consequence');
    expect(route).toContain('Audit reason');
    expect(route).toContain(
      'If the edition, storyline identity, revision or publication state changes before commit, Solaris rejects this reviewed action and requires a new review.',
    );
  });
});

import { describe, expect, it } from 'vitest';

import {
  parseAnniversaryEngine,
  parseStorylineItem,
  parseStorytellingSnapshot,
  storylineReadiness,
  storyOperationLabel,
  storyStatusTone,
  type StorytellingSnapshot,
} from './studio2-storytelling';

function snapshot(overrides: Partial<StorytellingSnapshot> = {}): StorytellingSnapshot {
  return {
    edition: {
      id: 'edition-1',
      name: 'SSC 20',
      slug: 'ssc-20',
      editionNumber: 20,
      eventDate: '2026-12-12',
      published: true,
    },
    sourceEventCount: 12,
    eligibleSourceEventCount: 6,
    lastSourceEventAt: '2026-12-12T22:00:00Z',
    storyline: {
      id: 'story-1',
      editionId: 'edition-1',
      title: 'SSC 20: The Story',
      subtitle: null,
      introduction: 'A reviewed edition story built from canonical events.',
      status: 'draft',
      revision: 4,
      sourceEventCount: 12,
      generatedAt: '2026-12-12T22:10:00Z',
      publishedAt: null,
      createdAt: '2026-12-12T22:10:00Z',
      updatedAt: '2026-12-12T22:20:00Z',
      items: [
        {
          id: 'item-1',
          sourceEventId: 'event-1',
          sourceEventType: 'jury.opened',
          occurredAt: '2026-12-10T10:00:00Z',
          importance: 70,
          headline: 'Jury voting opened',
          summary: 'Jury voting opened for SSC 20.',
          canonicalFacts: { sourceEventId: 'event-1' },
          included: true,
          manualOverride: false,
          sortOrder: 10,
          updatedAt: '2026-12-12T22:10:00Z',
        },
        {
          id: 'item-2',
          sourceEventId: 'event-2',
          sourceEventType: 'televote.opened',
          occurredAt: '2026-12-12T20:00:00Z',
          importance: 74,
          headline: 'The televote opened',
          summary: 'Public voting opened for SSC 20.',
          canonicalFacts: { sourceEventId: 'event-2' },
          included: true,
          manualOverride: true,
          sortOrder: 20,
          updatedAt: '2026-12-12T22:15:00Z',
        },
        {
          id: 'item-3',
          sourceEventId: 'event-3',
          sourceEventType: 'results.published',
          occurredAt: '2026-12-12T22:00:00Z',
          importance: 100,
          headline: 'The result became official',
          summary: 'SSC 20 reached its official result.',
          canonicalFacts: { sourceEventId: 'event-3' },
          included: true,
          manualOverride: false,
          sortOrder: 30,
          updatedAt: '2026-12-12T22:10:00Z',
        },
      ],
    },
    ...overrides,
  };
}

describe('Studio 2 storytelling model', () => {
  it('parses storyline items and preserves canonical metadata separately from editorial copy', () => {
    const parsed = parseStorylineItem(snapshot().storyline!.items[0]);
    expect(parsed.sourceEventType).toBe('jury.opened');
    expect(parsed.canonicalFacts).toEqual({ sourceEventId: 'event-1' });
    expect(parsed.manualOverride).toBe(false);
    expect(() => parseStorylineItem({ ...snapshot().storyline!.items[0], importance: 'nope' })).toThrow('Invalid storyline item importance');
  });

  it('parses the full organizer snapshot', () => {
    const parsed = parseStorytellingSnapshot(snapshot());
    expect(parsed.edition.editionNumber).toBe(20);
    expect(parsed.storyline?.revision).toBe(4);
    expect(parsed.storyline?.items).toHaveLength(3);
    expect(parsed.eligibleSourceEventCount).toBe(6);
  });

  it('requires a published edition, introduction and three included moments before publication', () => {
    expect(storylineReadiness(snapshot())).toEqual({
      included: 3,
      edited: 1,
      publishable: true,
      blockers: [],
    });

    const blocked = snapshot({
      edition: { ...snapshot().edition, published: false },
      storyline: {
        ...snapshot().storyline!,
        introduction: 'short',
        items: snapshot().storyline!.items.slice(0, 2),
      },
    });
    expect(storylineReadiness(blocked).publishable).toBe(false);
    expect(storylineReadiness(blocked).blockers).toEqual([
      'The edition must be published first.',
      'Add a storyline introduction.',
      'Include at least three story moments.',
    ]);
  });

  it('does not pretend an absent storyline is publishable', () => {
    expect(storylineReadiness(snapshot({ storyline: null }))).toEqual({
      included: 0,
      edited: 0,
      publishable: false,
      blockers: ['Generate the storyline first.'],
    });
  });

  it('parses date-aware anniversary buckets without exposing private canonical facts', () => {
    const parsed = parseAnniversaryEngine({
      referenceDate: '2026-09-17',
      timeZone: 'Europe/Paris',
      sscAnniversary: { birthDate: '2022-09-17', years: 4, label: '4 years of Solaris' },
      onThisDay: [{
        editionSlug: 'ssc-1',
        editionName: 'SSC 1',
        editionNumber: 1,
        headline: 'A new Solaris chapter began',
        summary: 'SSC 1 was created in Solaris Studio.',
        importance: 72,
        occurredAt: '2022-09-17T12:00:00Z',
        yearsAgo: 4,
        sourceEventType: 'edition.created',
      }],
      oneYearAgo: [],
      fiveYearsAgo: [],
      countryAnniversaries: [],
      recentStories: [],
    });
    expect(parsed.sscAnniversary?.years).toBe(4);
    expect(parsed.onThisDay[0].yearsAgo).toBe(4);
    expect('canonicalFacts' in parsed.onThisDay[0]).toBe(false);
  });

  it('labels publication state and operations consistently', () => {
    expect(storyStatusTone('published')).toBe('ready');
    expect(storyStatusTone('draft')).toBe('attention');
    expect(storyOperationLabel('publish_storyline')).toBe('Publish storyline');
    expect(storyOperationLabel('generate_storyline')).toBe('Generate storyline');
  });
});

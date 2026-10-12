import { describe, expect, it } from 'vitest';
import { buildV3OrganizerOverviewProjection } from './v3-organizer-ia';

const base = {
  context: {
    contextKey: 'solaris:ssc:edition-22:show-final',
    competitionId: 'ssc',
    editionId: 'edition-22',
    editionLabel: 'SSC 22',
    showId: 'show-final',
  },
  serverTime: '2026-10-12T04:00:00.000Z',
  readiness: { status: 'attention' as const, progress: 84, label: 'Needs attention' },
  live: { available: true, label: 'Grand Final live', detail: 'Voting is open', route: '/admin/live' },
  surfaceAccess: { control: true, live: true },
};

describe('V3 Organizer information architecture', () => {
  it('keeps the canonical Organizer shell order', () => {
    const projection = buildV3OrganizerOverviewProjection({
      ...base,
      tasks: [],
      inbox: [],
      upcoming: [],
    });

    expect(projection.navigation.map((item) => item.id)).toEqual([
      'overview',
      'tasks',
      'control',
      'live',
      'more',
    ]);
  });

  it('makes Do now task-driven rather than notification-driven', () => {
    const projection = buildV3OrganizerOverviewProjection({
      ...base,
      tasks: [
        {
          id: 'task-normal',
          title: 'Check artwork',
          detail: 'One delegation needs artwork review.',
          domain: 'media',
          href: '/admin/media',
          priority: 'normal' as const,
          state: 'open' as const,
        },
        {
          id: 'task-critical',
          title: 'Resolve result blocker',
          detail: 'Result publication is blocked.',
          domain: 'results',
          href: '/admin/results',
          priority: 'critical' as const,
          state: 'blocked' as const,
        },
      ],
      inbox: [
        {
          id: 'notice-1',
          title: 'Appeal received',
          unread: true,
          requiresAction: true,
          resolved: false,
        },
      ],
      upcoming: [],
    });

    expect(projection.doNow.map((item) => item.id)).toEqual(['task-critical', 'task-normal']);
    expect(projection.doNow.some((item) => item.id === 'notice-1')).toBe(false);
    expect(projection.inbox.map((item) => item.id)).toEqual(['notice-1']);
  });

  it('does not treat unread state as task truth', () => {
    const projection = buildV3OrganizerOverviewProjection({
      ...base,
      tasks: [],
      inbox: [
        { id: 'info', title: 'FYI', unread: true, requiresAction: false, resolved: false },
        { id: 'done', title: 'Resolved', unread: true, requiresAction: true, resolved: true },
        { id: 'action', title: 'Act', unread: false, requiresAction: true, resolved: false },
      ],
      upcoming: [],
    });

    expect(projection.unreadInboxCount).toBe(2);
    expect(projection.unresolvedInboxCount).toBe(1);
    expect(projection.inbox.map((item) => item.id)).toEqual(['action']);
  });

  it('uses server time to select the next operational item', () => {
    const projection = buildV3OrganizerOverviewProjection({
      ...base,
      tasks: [],
      inbox: [],
      upcoming: [
        { id: 'past', label: 'Past', detail: 'Past event', at: '2026-10-12T03:59:59.000Z' },
        { id: 'later', label: 'Later', detail: 'Later event', at: '2026-10-12T06:00:00.000Z' },
        { id: 'next', label: 'Next', detail: 'Next event', at: '2026-10-12T04:30:00.000Z' },
      ],
    });

    expect(projection.upcoming?.id).toBe('next');
  });

  it('consumes capability-resolved surface access instead of inferring organizer powers', () => {
    const projection = buildV3OrganizerOverviewProjection({
      ...base,
      surfaceAccess: { control: false, live: false },
      tasks: [],
      inbox: [],
      upcoming: [],
    });

    expect(projection.navigation.find((item) => item.id === 'control')?.available).toBe(false);
    expect(projection.navigation.find((item) => item.id === 'live')?.available).toBe(false);
    expect(projection.live).toBeNull();
  });

  it('enforces an exception-first Home content budget', () => {
    const tasks = Array.from({ length: 7 }, (_, index) => ({
      id: `task-${index}`,
      title: `Task ${index}`,
      detail: `Detail ${index}`,
      domain: 'entry',
      href: `/admin/tasks/${index}`,
      priority: 'high' as const,
      state: 'open' as const,
    }));

    const projection = buildV3OrganizerOverviewProjection({
      ...base,
      tasks,
      inbox: [],
      upcoming: [],
    });

    expect(projection.doNow).toHaveLength(4);
    expect(projection.remainingTaskCount).toBe(3);
  });

  it('keeps explicit edition context instead of guessing from an edition number', () => {
    const projection = buildV3OrganizerOverviewProjection({
      ...base,
      context: {
        contextKey: 'solaris:ssc:edition-special',
        competitionId: 'ssc',
        editionId: 'edition-special',
        editionLabel: 'SSC Special',
        showId: null,
      },
      tasks: [],
      inbox: [],
      upcoming: [],
    });

    expect(projection.context.editionId).toBe('edition-special');
    expect(projection.context.editionLabel).toBe('SSC Special');
  });
});

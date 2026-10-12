import { describe, expect, it } from 'vitest';
import {
  buildV3OrganizerControlProjection,
  V3_ORGANIZER_CONTROL_DOMAIN_ORDER,
  V3_ORGANIZER_CONTROL_POLICY,
  type V3OrganizerControlModuleInput,
} from './v3-organizer-control-ia';

const context = {
  contextKey: 'solaris:ssc:edition-22:show-final',
  competitionId: 'ssc',
  editionId: 'edition-22',
  editionLabel: 'SSC 22',
  showId: 'show-final',
};

function module(
  domain: V3OrganizerControlModuleInput['domain'],
  route: string,
): V3OrganizerControlModuleInput {
  return {
    domain,
    label: domain,
    description: `${domain} controls`,
    availability: 'available',
    workspaces: [
      {
        id: `${domain}-workspace`,
        label: `${domain} workspace`,
        description: `Open ${domain}`,
        route,
        availability: 'available',
      },
    ],
  };
}

describe('V3 Organizer Control information architecture', () => {
  it('orders the six operational domains consistently regardless of source order', () => {
    const projection = buildV3OrganizerControlProjection({
      context,
      modules: [
        module('results', '/admin/results'),
        module('delegations', '/admin/countries'),
        module('broadcast', '/admin/design/ssc-22'),
        module('contest', '/admin/ssc-22'),
        module('publication', '/admin/publication/ssc-22'),
        module('voting', '/televoting/admin'),
      ],
    });

    expect(projection.modules.map((item) => item.domain)).toEqual(V3_ORGANIZER_CONTROL_DOMAIN_ORDER);
  });

  it('keeps capability-hidden modules out of the control surface', () => {
    const hiddenVoting: V3OrganizerControlModuleInput = {
      ...module('voting', '/televoting/admin'),
      availability: 'hidden',
    };
    const projection = buildV3OrganizerControlProjection({
      context,
      modules: [module('delegations', '/admin/countries'), hiddenVoting],
    });

    expect(projection.modules.map((item) => item.domain)).toEqual(['delegations']);
  });

  it('requires every blocked module and workspace to explain why', () => {
    expect(() =>
      buildV3OrganizerControlProjection({
        context,
        modules: [
          {
            ...module('results', '/admin/results'),
            availability: 'blocked',
            blockedReason: null,
          },
        ],
      }),
    ).toThrow(/explain why/);

    expect(() =>
      buildV3OrganizerControlProjection({
        context,
        modules: [
          {
            ...module('results', '/admin/results'),
            workspaces: [
              {
                id: 'locked-results',
                label: 'Results',
                description: 'Review results',
                route: '/admin/results',
                availability: 'blocked',
              },
            ],
          },
        ],
      }),
    ).toThrow(/explain why/);
  });

  it('propagates a blocked module reason to its visible child workspaces', () => {
    const projection = buildV3OrganizerControlProjection({
      context,
      modules: [
        {
          ...module('publication', '/admin/publication/ssc-22'),
          availability: 'blocked',
          blockedReason: 'Select an edition with publication access.',
        },
      ],
    });

    expect(projection.modules[0].workspaces[0]).toMatchObject({
      availability: 'blocked',
      blockedReason: 'Select an edition with publication access.',
    });
  });

  it('rejects duplicate domains and workspace identities', () => {
    expect(() =>
      buildV3OrganizerControlProjection({
        context,
        modules: [module('contest', '/admin/a'), module('contest', '/admin/b')],
      }),
    ).toThrow(/Duplicate Organizer Control domain/);

    const first = module('contest', '/admin/a');
    const second = module('results', '/admin/b');
    second.workspaces = [{ ...second.workspaces[0], id: first.workspaces[0].id }];

    expect(() =>
      buildV3OrganizerControlProjection({ context, modules: [first, second] }),
    ).toThrow(/Duplicate Organizer Control workspace/);
  });

  it('rejects external URLs so Control cannot become an ungoverned launcher', () => {
    expect(() =>
      buildV3OrganizerControlProjection({
        context,
        modules: [module('broadcast', 'https://example.com/admin')],
      }),
    ).toThrow(/internal Solaris route/);
  });

  it('keeps direct mutations, Live operations, diagnostics and task exceptions out of Control', () => {
    expect(V3_ORGANIZER_CONTROL_POLICY).toEqual({
      directMutationFromControlTile: false,
      advancedDiagnosticsOwner: 'more',
      liveOperationsOwner: 'live',
      exceptionQueueOwner: 'tasks',
    });
  });
});

import { describe, expect, it } from 'vitest';

import type { Country, Edition, Participant, Show } from './data';
import type { EditionRuntimeState } from './edition-state';
import { buildStudio2WorkflowModel, filterStudio2Workflows } from './studio2-workflows';

const edition: Edition = {
  id: 'edition-1',
  edition_number: 21,
  name: 'SSC 21',
  year: 2026,
  slug: 'ssc-21',
  description: null,
  host_country_id: 'country-1',
  host_city: 'Tetlehamn',
  logo: null,
  theme_id: null,
  status: 'active',
  published: false,
};

const country: Country = {
  id: 'country-1',
  name: 'Oland',
  native_name: null,
  short_code: 'OLA',
  flag_image: null,
  region: 'Europe',
  accent_color: '#000000',
  description: null,
  first_participation: 2022,
};

const participant: Participant = {
  id: 'participant-1',
  edition_id: 'edition-1',
  show_id: 'show-1',
  country_id: 'country-1',
  contest_entity_id: null,
  artist: 'Artist',
  song: null,
  running_order: null,
  semi_final: '',
  qualified: null,
  notes: null,
};

const show: Show = {
  id: 'show-1',
  edition_id: 'edition-1',
  name: 'Grand Final',
  kind: 'grand-final',
  sort_order: 1,
  published: false,
  status: 'draft',
  qualifier_count: null,
  theme_id: null,
  voting_config: null,
  broadcast_config: {},
  publication_config: null,
};

const runtime: EditionRuntimeState = {
  edition: 'pre_show',
  subsystems: {
    confirmations: 'locked',
    submissions: 'locked',
    juryVoting: 'not_started',
    televoting: 'not_started',
    results: 'not_started',
    predictions: 'open',
  },
};

describe('Studio 2 workflow operations model', () => {
  it('derives edition, entry and show workflow instances from canonical state', () => {
    const model = buildStudio2WorkflowModel({
      edition,
      participants: [participant],
      shows: [show],
      countries: [country],
      runtime,
      now: new Date('2026-09-11T18:00:00.000Z'),
    });

    expect(model.workflows).toHaveLength(3);
    expect(model.workflows.some((workflow) => workflow.id === 'edition:edition-1')).toBe(true);

    const entry = model.workflows.find((workflow) => workflow.id === 'entry:participant-1');
    expect(entry?.countryName).toBe('Oland');
    expect(entry?.owner).toBe('delegation');
    expect(entry?.status).toBe('ready');
    expect(entry?.tasks.find((task) => task.id === 'entry.song-info')?.effectiveStatus).toBe('ready');
    expect(entry?.tasks.find((task) => task.id === 'entry.running-order')?.effectiveStatus).toBe('ready');

    const showWorkflow = model.workflows.find((workflow) => workflow.id === 'show:show-1');
    expect(showWorkflow?.href).toBe('/admin/broadcast-rundown');
    expect(showWorkflow?.tasks.find((task) => task.id === 'show.rundown')?.effectiveStatus).toBe('blocked');
  });

  it('marks complete canonical entry readiness as complete', () => {
    const model = buildStudio2WorkflowModel({
      edition,
      participants: [{ ...participant, song: 'Song', running_order: 1 }],
      shows: [{ ...show, broadcast_config: { studio2Rundown: { version: 1 } } }],
      countries: [country],
      runtime,
    });

    const entry = model.workflows.find((workflow) => workflow.id === 'entry:participant-1');
    expect(entry?.status).toBe('completed');
    expect(entry?.progress).toBe(100);

    const showWorkflow = model.workflows.find((workflow) => workflow.id === 'show:show-1');
    expect(showWorkflow?.status).toBe('completed');
  });

  it('adds voting and results tasks only when the edition lifecycle makes them relevant', () => {
    const resultsRuntime: EditionRuntimeState = {
      edition: 'results',
      subsystems: {
        ...runtime.subsystems,
        juryVoting: 'locked',
        televoting: 'locked',
        results: 'published',
      },
    };
    const model = buildStudio2WorkflowModel({
      edition,
      participants: [{ ...participant, song: 'Song', running_order: 1 }],
      shows: [{ ...show, broadcast_config: { studio2Rundown: {} } }],
      countries: [country],
      runtime: resultsRuntime,
    });

    const showWorkflow = model.workflows.find((workflow) => workflow.id === 'show:show-1');
    expect(showWorkflow?.tasks.map((task) => task.id)).toEqual(expect.arrayContaining([
      'show.jury',
      'show.televote',
      'show.results',
    ]));
    expect(showWorkflow?.status).toBe('completed');
  });

  it('supports URL-friendly status, type, owner, country and text filters', () => {
    const model = buildStudio2WorkflowModel({
      edition,
      participants: [participant],
      shows: [show],
      countries: [country],
      runtime,
    });

    expect(filterStudio2Workflows(model.workflows, { kind: 'entry' }).map((workflow) => workflow.id)).toEqual([
      'entry:participant-1',
    ]);
    expect(filterStudio2Workflows(model.workflows, { owner: 'delegation', countryId: 'country-1' })).toHaveLength(1);
    expect(filterStudio2Workflows(model.workflows, { q: 'oland' })).toHaveLength(1);
    expect(filterStudio2Workflows(model.workflows, { status: 'completed' })).toHaveLength(0);
  });
});

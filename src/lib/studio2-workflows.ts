import type { Country, Edition, Participant, Show } from './data';
import { EDITION_STATES, type EditionRuntimeState, type SubsystemState } from './edition-state';
import {
  evaluateWorkflow,
  type WorkflowEvaluation,
  type WorkflowSummary,
  type WorkflowTask,
  type WorkflowTaskStatus,
} from './workflow-engine';

export const STUDIO2_WORKFLOW_KINDS = ['edition', 'entry', 'show'] as const;
export type Studio2WorkflowKind = (typeof STUDIO2_WORKFLOW_KINDS)[number];

export const STUDIO2_WORKFLOW_STATUSES = ['blocked', 'ready', 'in_progress', 'completed'] as const;
export type Studio2WorkflowStatus = (typeof STUDIO2_WORKFLOW_STATUSES)[number];

export const STUDIO2_WORKFLOW_OWNERS = ['organizer', 'delegation'] as const;
export type Studio2WorkflowOwner = (typeof STUDIO2_WORKFLOW_OWNERS)[number];

export type Studio2WorkflowInstance = {
  id: string;
  kind: Studio2WorkflowKind;
  title: string;
  entityLabel: string;
  owner: Studio2WorkflowOwner;
  status: Studio2WorkflowStatus;
  countryId: string | null;
  countryName: string | null;
  href: string;
  progress: number;
  blockedCount: number;
  overdueCount: number;
  nextTaskIds: string[];
  tasks: WorkflowEvaluation[];
};

export type Studio2WorkflowFilters = {
  status?: Studio2WorkflowStatus | 'all';
  kind?: Studio2WorkflowKind | 'all';
  owner?: Studio2WorkflowOwner | 'all';
  countryId?: string | 'all';
  q?: string;
};

export type Studio2WorkflowModel = {
  workflows: Studio2WorkflowInstance[];
  metrics: {
    total: number;
    open: number;
    blocked: number;
    ready: number;
    completed: number;
    overdue: number;
  };
};

export type Studio2WorkflowInput = {
  edition: Edition;
  participants: readonly Participant[];
  shows: readonly Show[];
  countries: readonly Country[];
  runtime: EditionRuntimeState;
  now?: Date;
};

function task(
  id: string,
  label: string,
  complete: boolean,
  dependsOn: readonly string[] = [],
): WorkflowTask {
  return {
    id,
    label,
    status: complete ? 'completed' : 'pending',
    required: true,
    dependsOn,
  };
}

function statusFromSummary(summary: WorkflowSummary): Studio2WorkflowStatus {
  if (summary.complete) return 'completed';
  if (summary.blockedCount > 0) return 'blocked';
  if (summary.nextTaskIds.length > 0) return 'ready';
  return 'in_progress';
}

function createInstance(
  definition: Omit<Studio2WorkflowInstance, 'status' | 'progress' | 'blockedCount' | 'overdueCount' | 'nextTaskIds' | 'tasks'>,
  tasks: readonly WorkflowTask[],
  now: Date,
): Studio2WorkflowInstance {
  const summary = evaluateWorkflow(tasks, now);
  return {
    ...definition,
    status: statusFromSummary(summary),
    progress: summary.progress,
    blockedCount: summary.blockedCount,
    overdueCount: summary.overdueCount,
    nextTaskIds: summary.nextTaskIds,
    tasks: summary.tasks,
  };
}

function hasStudio2Rundown(show: Show): boolean {
  const config = show.broadcast_config;
  return Boolean(config && typeof config === 'object' && 'studio2Rundown' in config);
}

function terminalSubsystem(state: SubsystemState): boolean {
  return state === 'closed' || state === 'locked' || state === 'verified' || state === 'published';
}

function atOrAfter(current: EditionRuntimeState['edition'], target: EditionRuntimeState['edition']): boolean {
  return EDITION_STATES.indexOf(current) >= EDITION_STATES.indexOf(target);
}

function after(current: EditionRuntimeState['edition'], target: EditionRuntimeState['edition']): boolean {
  return EDITION_STATES.indexOf(current) > EDITION_STATES.indexOf(target);
}

function buildEditionWorkflow(input: Studio2WorkflowInput, now: Date): Studio2WorkflowInstance {
  const { edition, runtime } = input;
  const tasks: WorkflowTask[] = [
    task(
      'edition.confirmations',
      'Confirmations complete',
      after(runtime.edition, 'confirmations') || terminalSubsystem(runtime.subsystems.confirmations),
    ),
    task(
      'edition.submissions',
      'Submissions complete',
      after(runtime.edition, 'submissions') || terminalSubsystem(runtime.subsystems.submissions),
      ['edition.confirmations'],
    ),
    task(
      'edition.pre-show',
      'Pre-show preparation reached',
      atOrAfter(runtime.edition, 'pre_show'),
      ['edition.submissions'],
    ),
    task(
      'edition.rehearsals',
      'Rehearsals complete',
      after(runtime.edition, 'rehearsals'),
      ['edition.pre-show'],
    ),
    task(
      'edition.jury',
      'Jury voting complete',
      after(runtime.edition, 'jury_voting') || terminalSubsystem(runtime.subsystems.juryVoting),
      ['edition.rehearsals'],
    ),
    task(
      'edition.live-show',
      'Live show complete',
      after(runtime.edition, 'live_show'),
      ['edition.jury'],
    ),
    task(
      'edition.televote',
      'Televoting complete',
      after(runtime.edition, 'televoting') || terminalSubsystem(runtime.subsystems.televoting),
      ['edition.live-show'],
    ),
    task(
      'edition.results',
      'Results published',
      runtime.subsystems.results === 'published' || after(runtime.edition, 'results'),
      ['edition.televote'],
    ),
  ];

  return createInstance(
    {
      id: `edition:${edition.id}`,
      kind: 'edition',
      title: 'Edition lifecycle',
      entityLabel: edition.name,
      owner: 'organizer',
      countryId: null,
      countryName: null,
      href: '/admin/control-room',
    },
    tasks,
    now,
  );
}

function buildEntryWorkflow(
  participant: Participant,
  countryName: string | null,
  editionSlug: string,
  now: Date,
): Studio2WorkflowInstance {
  const hasArtist = Boolean(participant.artist?.trim());
  const hasSong = Boolean(participant.song?.trim());
  const allocated = Boolean(participant.show_id);
  const hasRunningOrder = participant.running_order != null;

  const tasks: WorkflowTask[] = [
    task('entry.artist-info', 'Artist information', hasArtist),
    task('entry.song-info', 'Song information', hasSong),
    task('entry.show-allocation', 'Show allocation', allocated, ['entry.artist-info', 'entry.song-info']),
    task('entry.running-order', 'Running order', hasRunningOrder, ['entry.show-allocation']),
  ];

  const title = participant.artist?.trim() || countryName || 'Entry';
  return createInstance(
    {
      id: `entry:${participant.id}`,
      kind: 'entry',
      title: `${title} entry workflow`,
      entityLabel: countryName ?? participant.country_id,
      owner: 'delegation',
      countryId: participant.country_id,
      countryName,
      href: `/admin/participant-status/${editionSlug}`,
    },
    tasks,
    now,
  );
}

function buildShowWorkflow(
  show: Show,
  participants: readonly Participant[],
  runtime: EditionRuntimeState,
  now: Date,
): Studio2WorkflowInstance {
  const showParticipants = participants.filter((participant) => participant.show_id === show.id);
  const hasParticipants = showParticipants.length > 0;
  const lineupReady = hasParticipants && showParticipants.every((participant) => participant.running_order != null);

  const tasks: WorkflowTask[] = [
    task('show.participants', 'Participants assigned', hasParticipants),
    task('show.lineup', 'Running order ready', lineupReady, ['show.participants']),
    task('show.rundown', 'Studio 2 rundown present', hasStudio2Rundown(show), ['show.lineup']),
  ];

  if (atOrAfter(runtime.edition, 'jury_voting')) {
    tasks.push(task('show.jury', 'Jury voting complete', terminalSubsystem(runtime.subsystems.juryVoting)));
  }
  if (atOrAfter(runtime.edition, 'televoting')) {
    tasks.push(task('show.televote', 'Televoting complete', terminalSubsystem(runtime.subsystems.televoting)));
  }
  if (atOrAfter(runtime.edition, 'results')) {
    const resultDependencies = tasks
      .filter((candidate) => candidate.id === 'show.jury' || candidate.id === 'show.televote')
      .map((candidate) => candidate.id);
    tasks.push(
      task(
        'show.results',
        'Results published',
        runtime.subsystems.results === 'published',
        resultDependencies,
      ),
    );
  }

  return createInstance(
    {
      id: `show:${show.id}`,
      kind: 'show',
      title: `${show.name} readiness`,
      entityLabel: show.name,
      owner: 'organizer',
      countryId: null,
      countryName: null,
      href: '/admin/broadcast-rundown',
    },
    tasks,
    now,
  );
}

export function buildStudio2WorkflowModel(input: Studio2WorkflowInput): Studio2WorkflowModel {
  const now = input.now ?? new Date();
  const countries = new Map(input.countries.map((country) => [country.id, country.name]));
  const workflows: Studio2WorkflowInstance[] = [
    buildEditionWorkflow(input, now),
    ...input.participants.map((participant) =>
      buildEntryWorkflow(participant, countries.get(participant.country_id) ?? null, input.edition.slug, now),
    ),
    ...input.shows.map((show) => buildShowWorkflow(show, input.participants, input.runtime, now)),
  ];

  workflows.sort((a, b) => {
    const rank: Record<Studio2WorkflowStatus, number> = { blocked: 0, ready: 1, in_progress: 2, completed: 3 };
    return rank[a.status] - rank[b.status] || a.title.localeCompare(b.title);
  });

  return {
    workflows,
    metrics: {
      total: workflows.length,
      open: workflows.filter((workflow) => workflow.status !== 'completed').length,
      blocked: workflows.filter((workflow) => workflow.status === 'blocked').length,
      ready: workflows.filter((workflow) => workflow.status === 'ready').length,
      completed: workflows.filter((workflow) => workflow.status === 'completed').length,
      overdue: workflows.filter((workflow) => workflow.overdueCount > 0).length,
    },
  };
}

export function filterStudio2Workflows(
  workflows: readonly Studio2WorkflowInstance[],
  filters: Studio2WorkflowFilters,
): Studio2WorkflowInstance[] {
  const query = filters.q?.trim().toLowerCase() ?? '';
  return workflows.filter((workflow) => {
    if (filters.status && filters.status !== 'all' && workflow.status !== filters.status) return false;
    if (filters.kind && filters.kind !== 'all' && workflow.kind !== filters.kind) return false;
    if (filters.owner && filters.owner !== 'all' && workflow.owner !== filters.owner) return false;
    if (filters.countryId && filters.countryId !== 'all' && workflow.countryId !== filters.countryId) return false;
    if (!query) return true;

    const haystack = [
      workflow.title,
      workflow.entityLabel,
      workflow.countryName ?? '',
      workflow.kind,
      workflow.status,
      ...workflow.tasks.map((task) => task.label),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function workflowTaskStatusLabel(status: WorkflowTaskStatus): string {
  return status.replace(/_/g, ' ');
}

import type { ContestEvent, ContestEventType } from './contest-events';
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

export type Studio2WorkflowHistoryItem = {
  id: string;
  type: ContestEventType;
  occurredAt: string;
};

export type Studio2WorkflowAction = {
  label: string;
  href: string;
};

export type Studio2WorkflowDeadline = {
  id: string;
  kind: string;
  label: string;
  due_at: string;
  show_id?: string | null;
  completed_at?: string | null;
};

export type Studio2WorkflowAutomation = {
  id: string;
  title: string;
  description: string;
  href: string;
};

export type Studio2WorkflowInstance = {
  id: string;
  kind: Studio2WorkflowKind;
  kindLabel: string;
  title: string;
  entityLabel: string;
  owner: Studio2WorkflowOwner;
  assignedRole: string;
  status: Studio2WorkflowStatus;
  trigger: string;
  currentStage: string;
  dueAt: string | null;
  failureReason: string | null;
  countryId: string | null;
  countryName: string | null;
  href: string;
  progress: number;
  blockedCount: number;
  overdueCount: number;
  nextTaskIds: string[];
  tasks: WorkflowEvaluation[];
  history: Studio2WorkflowHistoryItem[];
  availableActions: Studio2WorkflowAction[];
};

export type Studio2WorkflowFilters = {
  status?: Studio2WorkflowStatus | 'all';
  kind?: Studio2WorkflowKind | 'all';
  owner?: Studio2WorkflowOwner | 'all';
  countryId?: string | 'all';
  q?: string;
};

export type Studio2TaskBoardItem = {
  id: string;
  workflowId: string;
  workflowTitle: string;
  label: string;
  status: WorkflowTaskStatus;
  overdue: boolean;
  dueAt: string | null;
};

export type Studio2TaskBoard = {
  pending: Studio2TaskBoardItem[];
  inProgress: Studio2TaskBoardItem[];
  blocked: Studio2TaskBoardItem[];
  completed: Studio2TaskBoardItem[];
};

export type Studio2WorkflowModel = {
  workflows: Studio2WorkflowInstance[];
  taskBoard: Studio2TaskBoard;
  automations: Studio2WorkflowAutomation[];
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
  deadlines?: readonly Studio2WorkflowDeadline[];
  events?: readonly ContestEvent[];
  now?: Date;
};

type WorkflowDefinition = Omit<
  Studio2WorkflowInstance,
  | 'status'
  | 'currentStage'
  | 'failureReason'
  | 'progress'
  | 'blockedCount'
  | 'overdueCount'
  | 'nextTaskIds'
  | 'tasks'
>;

function task(
  id: string,
  label: string,
  complete: boolean,
  dependsOn: readonly string[] = [],
  dueAt?: string | null,
): WorkflowTask {
  return {
    id,
    label,
    status: complete ? 'completed' : 'pending',
    required: true,
    dependsOn,
    dueAt: dueAt ?? null,
  };
}

function statusFromSummary(summary: WorkflowSummary): Studio2WorkflowStatus {
  if (summary.complete) return 'completed';
  if (summary.blockedCount > 0) return 'blocked';
  if (summary.tasks.some((candidate) => candidate.effectiveStatus === 'in_progress')) return 'in_progress';
  return 'ready';
}

function currentStage(summary: WorkflowSummary): string {
  const active = summary.tasks.find((candidate) => candidate.effectiveStatus === 'in_progress')
    ?? summary.tasks.find((candidate) => candidate.effectiveStatus === 'ready')
    ?? summary.tasks.find((candidate) => candidate.effectiveStatus === 'blocked');
  return active?.label ?? 'Completed';
}

function failureReason(summary: WorkflowSummary): string | null {
  const blocked = summary.tasks.filter((candidate) => candidate.effectiveStatus === 'blocked');
  if (!blocked.length) return null;
  return blocked
    .map((candidate) => candidate.blockers.length
      ? `${candidate.label}: waiting for ${candidate.blockers.join(', ')}`
      : candidate.label)
    .join(' · ');
}

function createInstance(
  definition: WorkflowDefinition,
  tasks: readonly WorkflowTask[],
  now: Date,
): Studio2WorkflowInstance {
  const summary = evaluateWorkflow(tasks, now);
  return {
    ...definition,
    status: statusFromSummary(summary),
    currentStage: currentStage(summary),
    failureReason: failureReason(summary),
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

function deadlineFor(
  deadlines: readonly Studio2WorkflowDeadline[],
  keywords: readonly string[],
  showId?: string | null,
): Studio2WorkflowDeadline | null {
  const normalized = keywords.map((keyword) => keyword.toLowerCase());
  return [...deadlines]
    .filter((deadline) => !deadline.completed_at)
    .filter((deadline) => !showId || !deadline.show_id || deadline.show_id === showId)
    .filter((deadline) => {
      const value = `${deadline.kind} ${deadline.label}`.toLowerCase();
      return normalized.some((keyword) => value.includes(keyword));
    })
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())[0] ?? null;
}

function historyFor(
  events: readonly ContestEvent[],
  predicate: (event: ContestEvent) => boolean,
): Studio2WorkflowHistoryItem[] {
  return events
    .filter(predicate)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, 10)
    .map((event) => ({ id: event.id, type: event.type, occurredAt: event.occurredAt }));
}

function stageMetadata(state: EditionRuntimeState['edition'], slug: string) {
  switch (state) {
    case 'confirmations':
      return {
        label: 'Confirmation cycle',
        trigger: 'Confirmation window opened',
        deadlineKeywords: ['confirmation'],
        href: '/confirmations/admin',
      };
    case 'submissions':
      return {
        label: 'Submission review',
        trigger: 'Submission window opened',
        deadlineKeywords: ['submission', 'entry'],
        href: `/admin/participant-status/${slug}`,
      };
    case 'pre_show':
    case 'rehearsals':
      return {
        label: 'Broadcast preparation',
        trigger: 'Edition entered pre-show preparation',
        deadlineKeywords: ['rehearsal', 'broadcast', 'show'],
        href: '/admin/broadcast-rundown',
      };
    case 'jury_voting':
      return {
        label: 'Jury setup',
        trigger: 'Jury voting opened',
        deadlineKeywords: ['jury'],
        href: `/admin/jury/${slug}`,
      };
    case 'live_show':
    case 'televoting':
      return {
        label: 'Live voting',
        trigger: 'Live voting stage reached',
        deadlineKeywords: ['televote', 'voting'],
        href: `/admin/televote/${slug}`,
      };
    case 'vote_verification':
      return {
        label: 'Voting verification',
        trigger: 'Voting closed and verification started',
        deadlineKeywords: ['verification', 'vote'],
        href: '/admin/voting-lab',
      };
    case 'results':
      return {
        label: 'Result publication',
        trigger: 'Verified results became eligible for publication',
        deadlineKeywords: ['result', 'publication'],
        href: '/admin/results-reveal',
      };
    case 'post_edition':
    case 'archived':
      return {
        label: 'Edition closure',
        trigger: 'Edition entered post-contest closure',
        deadlineKeywords: ['archive', 'post'],
        href: '/admin/control-room',
      };
    default:
      return {
        label: 'Edition planning',
        trigger: 'Edition lifecycle initialized',
        deadlineKeywords: ['planning', 'host'],
        href: '/admin/control-room',
      };
  }
}

function buildEditionWorkflow(input: Studio2WorkflowInput, now: Date): Studio2WorkflowInstance {
  const { edition, runtime } = input;
  const metadata = stageMetadata(runtime.edition, edition.slug);
  const deadline = deadlineFor(input.deadlines ?? [], metadata.deadlineKeywords);
  const tasks: WorkflowTask[] = [
    task(
      'edition.confirmations',
      'Confirmations complete',
      after(runtime.edition, 'confirmations') || terminalSubsystem(runtime.subsystems.confirmations),
      [],
      runtime.edition === 'confirmations' ? deadline?.due_at : null,
    ),
    task(
      'edition.submissions',
      'Submissions complete',
      after(runtime.edition, 'submissions') || terminalSubsystem(runtime.subsystems.submissions),
      ['edition.confirmations'],
      runtime.edition === 'submissions' ? deadline?.due_at : null,
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
      ['pre_show', 'rehearsals'].includes(runtime.edition) ? deadline?.due_at : null,
    ),
    task(
      'edition.jury',
      'Jury voting complete',
      after(runtime.edition, 'jury_voting') || terminalSubsystem(runtime.subsystems.juryVoting),
      ['edition.rehearsals'],
      runtime.edition === 'jury_voting' ? deadline?.due_at : null,
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
      runtime.edition === 'televoting' ? deadline?.due_at : null,
    ),
    task(
      'edition.results',
      'Results published',
      runtime.subsystems.results === 'published' || after(runtime.edition, 'results'),
      ['edition.televote'],
      runtime.edition === 'results' ? deadline?.due_at : null,
    ),
  ];

  return createInstance(
    {
      id: `edition:${edition.id}`,
      kind: 'edition',
      kindLabel: metadata.label,
      title: metadata.label,
      entityLabel: edition.name,
      owner: 'organizer',
      assignedRole: 'Organizer',
      trigger: metadata.trigger,
      dueAt: deadline?.due_at ?? null,
      countryId: null,
      countryName: null,
      href: metadata.href,
      history: historyFor(input.events ?? [], (event) => event.editionId === edition.id),
      availableActions: [
        { label: 'Open lifecycle controls', href: '/admin/control-room' },
        ...(metadata.href !== '/admin/control-room'
          ? [{ label: `Open ${metadata.label.toLowerCase()}`, href: metadata.href }]
          : []),
      ],
    },
    tasks,
    now,
  );
}

function buildEntryWorkflow(
  input: Studio2WorkflowInput,
  participant: Participant,
  countryName: string | null,
  now: Date,
): Studio2WorkflowInstance {
  const hasArtist = Boolean(participant.artist?.trim());
  const hasSong = Boolean(participant.song?.trim());
  const allocated = Boolean(participant.show_id);
  const hasRunningOrder = participant.running_order != null;
  const deadline = deadlineFor(input.deadlines ?? [], ['submission', 'entry']);

  const tasks: WorkflowTask[] = [
    task('entry.artist-info', 'Artist information', hasArtist, [], deadline?.due_at),
    task('entry.song-info', 'Song information', hasSong, [], deadline?.due_at),
    task('entry.show-allocation', 'Show allocation', allocated, ['entry.artist-info', 'entry.song-info']),
    task('entry.running-order', 'Running order', hasRunningOrder, ['entry.show-allocation']),
  ];

  const title = participant.artist?.trim() || countryName || 'Entry';
  const href = `/admin/participant-status/${input.edition.slug}`;
  return createInstance(
    {
      id: `entry:${participant.id}`,
      kind: 'entry',
      kindLabel: 'Submission review',
      title: `${title} submission review`,
      entityLabel: countryName ?? participant.country_id,
      owner: 'delegation',
      assignedRole: 'Delegation / Organizer review',
      trigger: 'Country confirmed or entry record created',
      dueAt: deadline?.due_at ?? null,
      countryId: participant.country_id,
      countryName,
      href,
      history: historyFor(input.events ?? [], (event) =>
        event.type.startsWith('entry.')
        && (event.entityId === participant.id || event.entityId === participant.country_id)),
      availableActions: [
        { label: 'Open participant status', href },
        { label: 'Open contest entry tools', href: `/admin/entries/${input.edition.slug}` },
      ],
    },
    tasks,
    now,
  );
}

function buildShowWorkflow(
  input: Studio2WorkflowInput,
  show: Show,
  now: Date,
): Studio2WorkflowInstance {
  const showParticipants = input.participants.filter((participant) => participant.show_id === show.id);
  const hasParticipants = showParticipants.length > 0;
  const lineupReady = hasParticipants && showParticipants.every((participant) => participant.running_order != null);
  const deadline = deadlineFor(input.deadlines ?? [], ['broadcast', 'rehearsal', 'show'], show.id);

  const tasks: WorkflowTask[] = [
    task('show.participants', 'Participants assigned', hasParticipants),
    task('show.lineup', 'Running order ready', lineupReady, ['show.participants']),
    task('show.rundown', 'Studio 2 rundown present', hasStudio2Rundown(show), ['show.lineup'], deadline?.due_at),
  ];

  if (atOrAfter(input.runtime.edition, 'jury_voting')) {
    tasks.push(task('show.jury', 'Jury voting complete', terminalSubsystem(input.runtime.subsystems.juryVoting)));
  }
  if (atOrAfter(input.runtime.edition, 'televoting')) {
    tasks.push(task('show.televote', 'Televoting complete', terminalSubsystem(input.runtime.subsystems.televoting)));
  }
  if (atOrAfter(input.runtime.edition, 'results')) {
    const resultDependencies = tasks
      .filter((candidate) => candidate.id === 'show.jury' || candidate.id === 'show.televote')
      .map((candidate) => candidate.id);
    tasks.push(
      task(
        'show.results',
        'Results published',
        input.runtime.subsystems.results === 'published',
        resultDependencies,
      ),
    );
  }

  return createInstance(
    {
      id: `show:${show.id}`,
      kind: 'show',
      kindLabel: 'Broadcast preparation',
      title: `${show.name} broadcast preparation`,
      entityLabel: show.name,
      owner: 'organizer',
      assignedRole: 'Broadcast / Organizer',
      trigger: 'Show created or edition entered pre-show preparation',
      dueAt: deadline?.due_at ?? null,
      countryId: null,
      countryName: null,
      href: '/admin/broadcast-rundown',
      history: historyFor(input.events ?? [], (event) =>
        event.type.startsWith('broadcast.') && (!event.entityId || event.entityId === show.id)),
      availableActions: [
        { label: 'Open Broadcast Rundown', href: '/admin/broadcast-rundown' },
        { label: 'Open line-up tools', href: `/admin/entries/${input.edition.slug}?show=${show.id}` },
      ],
    },
    tasks,
    now,
  );
}

export function buildStudio2TaskBoard(workflows: readonly Studio2WorkflowInstance[]): Studio2TaskBoard {
  const board: Studio2TaskBoard = { pending: [], inProgress: [], blocked: [], completed: [] };

  for (const workflow of workflows) {
    for (const candidate of workflow.tasks) {
      const item: Studio2TaskBoardItem = {
        id: `${workflow.id}:${candidate.id}`,
        workflowId: workflow.id,
        workflowTitle: workflow.title,
        label: candidate.label,
        status: candidate.effectiveStatus,
        overdue: candidate.overdue,
        dueAt: candidate.dueAt ?? null,
      };

      if (candidate.effectiveStatus === 'blocked') board.blocked.push(item);
      else if (candidate.effectiveStatus === 'in_progress') board.inProgress.push(item);
      else if (candidate.effectiveStatus === 'completed' || candidate.effectiveStatus === 'cancelled') board.completed.push(item);
      else board.pending.push(item);
    }
  }

  for (const list of Object.values(board)) {
    list.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.label.localeCompare(b.label));
  }
  return board;
}

function workflowAutomations(input: Studio2WorkflowInput): Studio2WorkflowAutomation[] {
  const automations: Studio2WorkflowAutomation[] = [];

  if (input.runtime.edition === 'confirmations' && input.runtime.subsystems.confirmations === 'open') {
    automations.push({
      id: 'monitor-confirmations',
      title: 'Monitor confirmation cycle',
      description: 'Confirmation opening creates monitoring work and highlights countries that still need organizer attention.',
      href: '/confirmations/admin',
    });
  }

  const confirmedEntries = input.participants.filter((participant) => participant.artist?.trim() && participant.song?.trim());
  if (confirmedEntries.length) {
    automations.push({
      id: 'submission-readiness',
      title: 'Create submission-readiness work',
      description: `${confirmedEntries.length} entry record${confirmedEntries.length === 1 ? '' : 's'} can feed readiness checks without silently approving or publishing anything.`,
      href: `/admin/participant-status/${input.edition.slug}`,
    });
  }

  if (input.runtime.edition === 'jury_voting') {
    automations.push({
      id: 'jury-roster-validation',
      title: 'Validate jury setup',
      description: 'Jury opening recommends roster and ballot-readiness checks before voting progresses.',
      href: `/admin/jury/${input.edition.slug}`,
    });
  }

  if (input.runtime.edition === 'results' || input.runtime.subsystems.results === 'verified') {
    automations.push({
      id: 'prepare-publication',
      title: 'Prepare result publication',
      description: 'Verified results may create publication preparation work. Publication itself remains an explicit organizer action.',
      href: '/admin/results-reveal',
    });
  }

  return automations;
}

export function buildStudio2WorkflowModel(input: Studio2WorkflowInput): Studio2WorkflowModel {
  const now = input.now ?? new Date();
  const countries = new Map(input.countries.map((country) => [country.id, country.name]));
  const workflows: Studio2WorkflowInstance[] = [
    buildEditionWorkflow(input, now),
    ...input.participants.map((participant) =>
      buildEntryWorkflow(input, participant, countries.get(participant.country_id) ?? null, now),
    ),
    ...input.shows.map((show) => buildShowWorkflow(input, show, now)),
  ];

  workflows.sort((a, b) => {
    const rank: Record<Studio2WorkflowStatus, number> = { blocked: 0, ready: 1, in_progress: 2, completed: 3 };
    return rank[a.status] - rank[b.status] || a.title.localeCompare(b.title);
  });

  return {
    workflows,
    taskBoard: buildStudio2TaskBoard(workflows),
    automations: workflowAutomations(input),
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
      workflow.kindLabel,
      workflow.status,
      workflow.currentStage,
      workflow.trigger,
      ...workflow.tasks.map((candidate) => candidate.label),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function workflowTaskStatusLabel(status: WorkflowTaskStatus): string {
  return status.replace(/_/g, ' ');
}

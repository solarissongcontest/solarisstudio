import type { ContestEvent } from './contest-events';
import { EDITION_STATES, getEditionTransition, type EditionSubsystem } from './edition-state';
import type { Participant, Show } from './data';
import type {
  Studio2IncidentRecord,
  Studio2RuntimeRecord,
  Studio2TransitionApprovalRecord,
} from './studio2-persistence';

export type Studio2ActionLane = 'critical' | 'attention' | 'upcoming' | 'recent';
export type Studio2ActionSource = 'incident' | 'transition' | 'subsystem' | 'entry' | 'broadcast' | 'event';

export type Studio2ActionItem = {
  id: string;
  lane: Studio2ActionLane;
  source: Studio2ActionSource;
  title: string;
  description: string;
  href: string;
  occurredAt?: string | null;
};

export type Studio2ActionCenterModel = {
  critical: Studio2ActionItem[];
  attention: Studio2ActionItem[];
  upcoming: Studio2ActionItem[];
  recent: Studio2ActionItem[];
  counts: {
    critical: number;
    attention: number;
    upcoming: number;
    recent: number;
  };
};

export type Studio2ActionCenterInput = {
  runtime: Studio2RuntimeRecord;
  incidents: readonly Studio2IncidentRecord[];
  approvals: readonly Studio2TransitionApprovalRecord[];
  participants: readonly Participant[];
  shows: readonly Show[];
  recentEvents: readonly ContestEvent[];
  editionSlug?: string | null;
  broadcastRundownEnabled?: boolean;
};

const SUBSYSTEM_LABELS: Record<EditionSubsystem, string> = {
  confirmations: 'Confirmations',
  submissions: 'Submissions',
  juryVoting: 'Jury voting',
  televoting: 'Televoting',
  results: 'Results',
  predictions: 'Predictions',
};

const EVENT_LABELS: Partial<Record<ContestEvent['type'], string>> = {
  'edition.state_changed': 'Edition state changed',
  'edition.transition_approval_requested': 'Transition approval requested',
  'edition.transition_approval_granted': 'Transition approval granted',
  'country.confirmed': 'Country confirmed',
  'entry.submitted': 'Entry submitted',
  'entry.changed': 'Entry changed',
  'entry.locked': 'Entry locked',
  'jury.ballot_submitted': 'Jury ballot submitted',
  'televote.ballot_submitted': 'Televote ballot submitted',
  'results.calculated': 'Results calculated',
  'results.verified': 'Results verified',
  'results.published': 'Results published',
  'incident.created': 'Incident created',
  'incident.updated': 'Incident updated',
  'incident.resolved': 'Incident resolved',
  'notice.sent': 'Official notice sent',
  'notice.acknowledged': 'Official notice acknowledged',
};

function stateIndex(state: Studio2RuntimeRecord['runtime']['edition']) {
  return EDITION_STATES.indexOf(state);
}

function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function eventDescription(event: ContestEvent) {
  const entity = event.entityType ? ` · ${humanize(event.entityType)}` : '';
  return `${humanize(event.type)}${entity}`;
}

export function buildStudio2ActionCenter(input: Studio2ActionCenterInput): Studio2ActionCenterModel {
  const critical: Studio2ActionItem[] = [];
  const attention: Studio2ActionItem[] = [];
  const upcoming: Studio2ActionItem[] = [];
  const recent: Studio2ActionItem[] = [];

  for (const incident of input.incidents) {
    if (incident.status === 'resolved') continue;
    const target = incident.severity === 'sev1' ? critical : attention;
    target.push({
      id: `incident:${incident.id}`,
      lane: incident.severity === 'sev1' ? 'critical' : 'attention',
      source: 'incident',
      title: `${incident.severity.toUpperCase()} · ${incident.title}`,
      description: `Incident is ${humanize(incident.status)} and has been active since ${new Date(incident.startedAt).toLocaleString()}.`,
      href: '/admin/control-room',
      occurredAt: incident.startedAt,
    });
  }

  for (const approval of input.approvals) {
    if (!approval.canApprove && !approval.canApply) continue;
    const transition = getEditionTransition(approval.from, approval.to);
    const lane: Studio2ActionLane = transition?.risk === 'critical' ? 'critical' : 'attention';
    const verb = approval.canApply ? 'Apply approved transition' : 'Approve transition';
    const item: Studio2ActionItem = {
      id: `transition:${approval.id}`,
      lane,
      source: 'transition',
      title: `${verb}: ${humanize(approval.from)} → ${humanize(approval.to)}`,
      description: approval.reason,
      href: '/admin/control-room',
      occurredAt: approval.requestedAt,
    };
    (lane === 'critical' ? critical : attention).push(item);
  }

  const pausedSubsystems = Object.entries(input.runtime.runtime.subsystems)
    .filter(([, status]) => status === 'paused')
    .map(([key]) => key as EditionSubsystem);

  for (const subsystem of pausedSubsystems) {
    attention.push({
      id: `subsystem:${subsystem}`,
      lane: 'attention',
      source: 'subsystem',
      title: `${SUBSYSTEM_LABELS[subsystem]} is paused`,
      description: 'This subsystem is paused in the persisted Studio 2 runtime and may require an organizer decision.',
      href: '/admin/control-room',
    });
  }

  const editionState = input.runtime.runtime.edition;
  const submissionRelevant = stateIndex(editionState) >= stateIndex('submissions') && editionState !== 'archived';
  if (submissionRelevant) {
    const incomplete = input.participants.filter((participant) => !participant.artist?.trim() || !participant.song?.trim());
    if (incomplete.length) {
      attention.push({
        id: 'entry:incomplete-participants',
        lane: 'attention',
        source: 'entry',
        title: `${incomplete.length} participant ${incomplete.length === 1 ? 'record needs' : 'records need'} entry details`,
        description: 'Artist or song information is missing from the canonical participant record.',
        href: input.editionSlug ? `/admin/participant-status/${input.editionSlug}` : '/admin',
      });
    }
  }

  const broadcastRelevant = stateIndex(editionState) >= stateIndex('pre_show') && editionState !== 'archived';
  if (input.broadcastRundownEnabled && broadcastRelevant) {
    const withoutRundown = input.shows.filter((show) => {
      const config = show.broadcast_config;
      return !config || typeof config !== 'object' || !('studio2Rundown' in config);
    });
    if (withoutRundown.length) {
      attention.push({
        id: 'broadcast:missing-rundown',
        lane: 'attention',
        source: 'broadcast',
        title: `${withoutRundown.length} show ${withoutRundown.length === 1 ? 'is' : 'are'} missing a Studio 2 rundown`,
        description: 'Create the persisted broadcast rundown before rehearsal or live-show operations.',
        href: '/admin/broadcast-rundown',
      });
    }
  }

  const currentIndex = stateIndex(editionState);
  for (const candidate of EDITION_STATES) {
    if (EDITION_STATES.indexOf(candidate) <= currentIndex) continue;
    const transition = getEditionTransition(editionState, candidate);
    if (!transition) continue;
    upcoming.push({
      id: `next:${editionState}:${candidate}`,
      lane: 'upcoming',
      source: 'transition',
      title: `Next lifecycle option: ${humanize(candidate)}`,
      description: `${humanize(transition.risk)}-risk transition from ${humanize(editionState)}.`,
      href: '/admin/control-room',
    });
  }

  for (const event of input.recentEvents.slice(0, 8)) {
    recent.push({
      id: `event:${event.id}`,
      lane: 'recent',
      source: 'event',
      title: EVENT_LABELS[event.type] ?? humanize(event.type),
      description: eventDescription(event),
      href: '/admin/control-room',
      occurredAt: event.occurredAt,
    });
  }

  critical.sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''));
  attention.sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''));
  recent.sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''));

  return {
    critical,
    attention,
    upcoming,
    recent,
    counts: {
      critical: critical.length,
      attention: attention.length,
      upcoming: upcoming.length,
      recent: recent.length,
    },
  };
}

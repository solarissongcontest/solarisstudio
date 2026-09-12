export const CONTEST_EVENT_TYPES = [
  'edition.created',
  'edition.state_changed',
  'edition.archived',
  'edition.transition_approval_requested',
  'edition.transition_approval_granted',
  'confirmation.opened',
  'confirmation.closed',
  'country.confirmed',
  'entry.submitted',
  'entry.changed',
  'entry.locked',
  'jury.opened',
  'jury.closed',
  'jury.ballot_submitted',
  'televote.opened',
  'televote.closed',
  'televote.ballot_submitted',
  'vote.flagged',
  'integrity.case_created',
  'integrity.case_closed',
  'results.calculated',
  'results.verified',
  'results.published',
  'broadcast.segment_started',
  'broadcast.segment_completed',
  'incident.created',
  'incident.updated',
  'incident.resolved',
  'notice.sent',
  'notice.acknowledged',
  'rule.changed',
  'storyline.generated',
  'storyline.updated',
  'storyline.published',
  'storyline.unpublished',
] as const;

export type ContestEventType = (typeof CONTEST_EVENT_TYPES)[number];

export type ContestEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  id: string;
  editionId: string;
  type: ContestEventType;
  occurredAt: string;
  actorUserId: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: TPayload;
};

export const PUBLIC_EVENT_TYPES = new Set<ContestEventType>([
  'country.confirmed',
  'results.published',
  'storyline.published',
]);

export function isContestEventType(value: string): value is ContestEventType {
  return (CONTEST_EVENT_TYPES as readonly string[]).includes(value);
}

export function isPublicContestEvent(type: ContestEventType): boolean {
  return PUBLIC_EVENT_TYPES.has(type);
}

import type { ContestEvent } from './contest-events';
import type { EditionState } from './edition-state';

export type EditionStateSnapshot = {
  editionId: string;
  state: EditionState;
  at: string;
  sourceEventId: string | null;
};

export function sortContestEvents(events: readonly ContestEvent[]): ContestEvent[] {
  return [...events].sort((a, b) => {
    const time = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    if (time !== 0) return time;
    return a.id.localeCompare(b.id);
  });
}

export function eventsThrough(
  events: readonly ContestEvent[],
  at: string | Date,
): ContestEvent[] {
  const limit = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (!Number.isFinite(limit)) throw new Error('A valid replay timestamp is required');

  return sortContestEvents(events).filter(
    (event) => new Date(event.occurredAt).getTime() <= limit,
  );
}

export function reconstructEditionState(
  editionId: string,
  initialState: EditionState,
  events: readonly ContestEvent[],
  at: string | Date,
): EditionStateSnapshot {
  const relevant = eventsThrough(events, at).filter(
    (event) => event.editionId === editionId && event.type === 'edition.state_changed',
  );

  let state = initialState;
  let sourceEventId: string | null = null;
  let sourceTime = at instanceof Date ? at.toISOString() : new Date(at).toISOString();

  for (const event of relevant) {
    const next = event.payload.to;
    if (typeof next !== 'string') continue;
    state = next as EditionState;
    sourceEventId = event.id;
    sourceTime = event.occurredAt;
  }

  return {
    editionId,
    state,
    at: sourceTime,
    sourceEventId,
  };
}

export type ScoreReplayPoint = {
  eventId: string;
  occurredAt: string;
  countryId: string;
  delta: number;
  total: number;
};

/**
 * Result replay consumes score-award events without knowing which voting model
 * produced them. Future jury/televote adapters only need to emit a standard
 * payload of { countryId, points }.
 */
export function buildScoreReplay(events: readonly ContestEvent[]): ScoreReplayPoint[] {
  const totals = new Map<string, number>();
  const replay: ScoreReplayPoint[] = [];

  for (const event of sortContestEvents(events)) {
    if (event.type !== 'jury.ballot_submitted' && event.type !== 'televote.ballot_submitted') continue;

    const awards = Array.isArray(event.payload.awards) ? event.payload.awards : [];
    for (const award of awards) {
      if (!award || typeof award !== 'object') continue;
      const countryId = 'countryId' in award ? award.countryId : null;
      const points = 'points' in award ? award.points : null;
      if (typeof countryId !== 'string' || typeof points !== 'number' || !Number.isFinite(points)) continue;

      const total = (totals.get(countryId) ?? 0) + points;
      totals.set(countryId, total);
      replay.push({
        eventId: event.id,
        occurredAt: event.occurredAt,
        countryId,
        delta: points,
        total,
      });
    }
  }

  return replay;
}

export const RUNDOWN_SEGMENT_STATUSES = ['planned', 'ready', 'live', 'completed', 'skipped'] as const;
export type RundownSegmentStatus = (typeof RUNDOWN_SEGMENT_STATUSES)[number];

export type RundownSegment = {
  id: string;
  label: string;
  plannedDurationSeconds: number;
  status: RundownSegmentStatus;
  actualStartedAt?: string | null;
  actualCompletedAt?: string | null;
};

export type ScheduledRundownSegment = RundownSegment & {
  plannedStartedAt: string;
  estimatedStartedAt: string;
  plannedCompletedAt: string;
  /** Projected cue end after observed overrun, early finish or pre-air skip. */
  estimatedCompletedAt: string;
  driftSeconds: number;
};

export type RundownStatus = {
  segments: ScheduledRundownSegment[];
  currentSegment: ScheduledRundownSegment | null;
  nextSegment: ScheduledRundownSegment | null;
  totalPlannedSeconds: number;
  estimatedFinishAt: string;
  overallDriftSeconds: number;
};

function secondsBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000);
}

function plusSeconds(timestamp: string, seconds: number): string {
  return new Date(new Date(timestamp).getTime() + seconds * 1000).toISOString();
}

export function buildBroadcastRundown(
  showStartsAt: string,
  segments: readonly RundownSegment[],
): RundownStatus {
  const startMs = new Date(showStartsAt).getTime();
  if (!Number.isFinite(startMs)) throw new Error('A valid show start time is required');

  let plannedCursor = new Date(startMs).toISOString();
  let estimatedCursor = plannedCursor;
  let latestDrift = 0;

  const scheduled = segments.map<ScheduledRundownSegment>((segment) => {
    if (!Number.isInteger(segment.plannedDurationSeconds) || segment.plannedDurationSeconds < 0) {
      throw new Error(`Invalid rundown duration for segment: ${segment.id}`);
    }

    const plannedStartedAt = plannedCursor;
    const plannedCompletedAt = plusSeconds(plannedStartedAt, segment.plannedDurationSeconds);
    let estimatedStartedAt = estimatedCursor;

    if (segment.actualStartedAt) {
      const actualStartMs = new Date(segment.actualStartedAt).getTime();
      if (!Number.isFinite(actualStartMs)) throw new Error(`Invalid actual start time for segment: ${segment.id}`);
      estimatedStartedAt = new Date(actualStartMs).toISOString();
      latestDrift = secondsBetween(plannedStartedAt, estimatedStartedAt);
    }

    // A cue skipped before going live never occupies airtime. The skip command
    // may record when the operator clicked Skip, which is not a broadcast end
    // timestamp and must not pull the schedule backwards or into the future.
    // A cue skipped *after* going live still uses its observed completion time.
    const skippedBeforeAir = segment.status === 'skipped' && !segment.actualStartedAt;
    let segmentEnd = skippedBeforeAir
      ? estimatedStartedAt
      : plusSeconds(estimatedStartedAt, segment.plannedDurationSeconds);
    if (segment.actualCompletedAt) {
      const actualEndMs = new Date(segment.actualCompletedAt).getTime();
      if (!Number.isFinite(actualEndMs)) throw new Error(`Invalid actual completion time for segment: ${segment.id}`);
      if (segment.actualStartedAt && actualEndMs < new Date(segment.actualStartedAt).getTime()) {
        throw new Error(`Actual completion precedes start for segment: ${segment.id}`);
      }
      if (!skippedBeforeAir) segmentEnd = new Date(actualEndMs).toISOString();
    }
    latestDrift = secondsBetween(plannedCompletedAt, segmentEnd);

    const scheduledSegment: ScheduledRundownSegment = {
      ...segment,
      plannedStartedAt,
      estimatedStartedAt,
      plannedCompletedAt,
      estimatedCompletedAt: segmentEnd,
      driftSeconds: latestDrift,
    };

    plannedCursor = plannedCompletedAt;
    estimatedCursor = segmentEnd;
    return scheduledSegment;
  });

  const currentIndex = scheduled.findIndex((segment) => segment.status === 'live');
  const currentSegment = currentIndex >= 0 ? scheduled[currentIndex] : null;
  const nextSegment =
    currentIndex >= 0
      ? scheduled.slice(currentIndex + 1).find((segment) => !['completed', 'skipped'].includes(segment.status)) ?? null
      : scheduled.find((segment) => !['completed', 'skipped'].includes(segment.status)) ?? null;

  return {
    segments: scheduled,
    currentSegment,
    nextSegment,
    totalPlannedSeconds: segments.reduce((sum, segment) => sum + segment.plannedDurationSeconds, 0),
    estimatedFinishAt: estimatedCursor,
    overallDriftSeconds: secondsBetween(plannedCursor, estimatedCursor),
  };
}

export type ParticipationActionStatus =
  | "available"
  | "upcoming"
  | "complete"
  | "unavailable";

export type ParticipationAction = {
  id: string;
  status: ParticipationActionStatus;
  title: string;
  description: string;
  to: string;
  priority: number;
  opensAt?: string | null;
  closesAt?: string | null;
};

const STATUS_ORDER: Record<ParticipationActionStatus, number> = {
  available: 0,
  upcoming: 1,
  complete: 2,
  unavailable: 3,
};

export function sortParticipationActions(actions: ParticipationAction[]) {
  return [...actions].sort((a, b) => {
    const statusDifference = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (statusDifference !== 0) return statusDifference;

    const priorityDifference = a.priority - b.priority;
    if (priorityDifference !== 0) return priorityDifference;

    const aTime = timestamp(a.closesAt ?? a.opensAt);
    const bTime = timestamp(b.closesAt ?? b.opensAt);
    return aTime - bTime;
  });
}

export function primaryParticipationAction(actions: ParticipationAction[]) {
  return sortParticipationActions(actions).find((action) => action.status === "available") ?? null;
}

export function upcomingParticipationActions(actions: ParticipationAction[]) {
  return sortParticipationActions(actions).filter((action) => action.status === "upcoming");
}

function timestamp(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

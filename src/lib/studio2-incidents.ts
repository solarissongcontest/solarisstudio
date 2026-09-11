import type { ContestEvent } from './contest-events';
import {
  INCIDENT_STATUSES,
  canTransitionIncident,
  incidentSeverityRank,
  type IncidentCategory,
  type IncidentSeverity,
  type IncidentStatus,
} from './incident-command';
import type { Studio2IncidentRecord } from './studio2-persistence';

export type Studio2IncidentFilters = {
  status?: IncidentStatus | 'active' | 'all';
  severity?: IncidentSeverity | 'all';
  category?: IncidentCategory | 'all';
  acknowledged?: 'yes' | 'no' | 'all';
  q?: string;
};

export type Studio2IncidentTimelineItem = {
  id: string;
  type: ContestEvent['type'];
  occurredAt: string;
  actorUserId: string | null;
  action: string | null;
  message: string | null;
  payload: Record<string, unknown>;
};

export type Studio2IncidentCommandModel = {
  incidents: Studio2IncidentRecord[];
  metrics: {
    active: number;
    critical: number;
    unacknowledged: number;
    crisis: number;
    resolved: number;
  };
};

export function buildIncidentCommandModel(
  incidents: readonly Studio2IncidentRecord[],
): Studio2IncidentCommandModel {
  const sorted = [...incidents].sort((a, b) => {
    const activeA = a.status === 'resolved' ? 1 : 0;
    const activeB = b.status === 'resolved' ? 1 : 0;
    return activeA - activeB
      || incidentSeverityRank(b.severity) - incidentSeverityRank(a.severity)
      || new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
  const active = sorted.filter((incident) => incident.status !== 'resolved');

  return {
    incidents: sorted,
    metrics: {
      active: active.length,
      critical: active.filter((incident) => incident.severity === 'sev1').length,
      unacknowledged: active.filter((incident) => !incident.acknowledgedAt).length,
      crisis: active.filter((incident) => incident.severity === 'sev1' || incident.crisisDeclaredAt).length,
      resolved: sorted.filter((incident) => incident.status === 'resolved').length,
    },
  };
}

export function filterStudio2Incidents(
  incidents: readonly Studio2IncidentRecord[],
  filters: Studio2IncidentFilters,
): Studio2IncidentRecord[] {
  const query = filters.q?.trim().toLowerCase() ?? '';
  return incidents.filter((incident) => {
    if (filters.status === 'active' && incident.status === 'resolved') return false;
    if (filters.status && filters.status !== 'all' && filters.status !== 'active' && incident.status !== filters.status) return false;
    if (filters.severity && filters.severity !== 'all' && incident.severity !== filters.severity) return false;
    if (filters.category && filters.category !== 'all' && incident.category !== filters.category) return false;
    if (filters.acknowledged === 'yes' && !incident.acknowledgedAt) return false;
    if (filters.acknowledged === 'no' && incident.acknowledgedAt) return false;
    if (!query) return true;

    return [
      incident.title,
      incident.description,
      incident.category,
      incident.severity,
      incident.status,
      incident.commanderId ?? '',
      incident.resolution ?? '',
      incident.postmortem ?? '',
      ...incident.affectedSystems,
    ].join(' ').toLowerCase().includes(query);
  });
}

export function availableIncidentTransitions(status: IncidentStatus): IncidentStatus[] {
  return INCIDENT_STATUSES.filter((candidate) => canTransitionIncident(status, candidate));
}

export function incidentTimeline(
  events: readonly ContestEvent[],
  incidentId: string,
): Studio2IncidentTimelineItem[] {
  return events
    .filter((event) => event.entityType === 'incident' && event.entityId === incidentId)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .map((event) => ({
      id: event.id,
      type: event.type,
      occurredAt: event.occurredAt,
      actorUserId: event.actorUserId,
      action: typeof event.payload.action === 'string' ? event.payload.action : null,
      message: typeof event.payload.message === 'string' ? event.payload.message : null,
      payload: event.payload,
    }));
}

export function incidentSeverityLabel(severity: IncidentSeverity): string {
  switch (severity) {
    case 'sev1': return 'SEV-1 Critical';
    case 'sev2': return 'SEV-2 Major';
    case 'sev3': return 'SEV-3 Moderate';
    case 'sev4': return 'SEV-4 Minor';
  }
}

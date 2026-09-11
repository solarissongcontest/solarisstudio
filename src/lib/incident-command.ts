export const INCIDENT_SEVERITIES = ['sev1', 'sev2', 'sev3', 'sev4'] as const;
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];

export const INCIDENT_CATEGORIES = [
  'voting',
  'broadcast',
  'delegation',
  'technical',
  'results',
  'security',
  'integrity',
  'publication',
  'other',
] as const;
export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const INCIDENT_STATUSES = ['open', 'mitigating', 'monitoring', 'resolved'] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export type Incident = {
  id: string;
  editionId: string | null;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt: string | null;
};

export type IncidentTransition = {
  from: IncidentStatus;
  to: IncidentStatus;
};

const NEXT_INCIDENT_STATES: Record<IncidentStatus, readonly IncidentStatus[]> = {
  open: ['mitigating', 'monitoring', 'resolved'],
  mitigating: ['monitoring', 'resolved'],
  monitoring: ['mitigating', 'resolved'],
  resolved: ['monitoring'],
};

export function canTransitionIncident(from: IncidentStatus, to: IncidentStatus): boolean {
  return NEXT_INCIDENT_STATES[from].includes(to);
}

export function assertIncidentTransition(from: IncidentStatus, to: IncidentStatus): IncidentTransition {
  if (!canTransitionIncident(from, to)) {
    throw new Error(`Illegal incident transition: ${from} -> ${to}`);
  }
  return { from, to };
}

export function incidentSeverityRank(severity: IncidentSeverity): number {
  switch (severity) {
    case 'sev1':
      return 4;
    case 'sev2':
      return 3;
    case 'sev3':
      return 2;
    case 'sev4':
      return 1;
  }
}

export function isCrisisModeRequired(incidents: readonly Incident[]): boolean {
  return incidents.some((incident) => incident.status !== 'resolved' && incident.severity === 'sev1');
}

export function summarizeIncidents(incidents: readonly Incident[]) {
  const active = incidents.filter((incident) => incident.status !== 'resolved');
  const sorted = [...active].sort(
    (a, b) => incidentSeverityRank(b.severity) - incidentSeverityRank(a.severity),
  );

  return {
    activeCount: active.length,
    criticalCount: active.filter((incident) => incident.severity === 'sev1').length,
    crisisMode: isCrisisModeRequired(active),
    highestSeverity: sorted[0]?.severity ?? null,
  };
}

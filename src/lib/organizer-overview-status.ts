import type {
  V3OrganizerRisk,
  V3OrganizerSystemHealth,
} from './v3-organizer-projection';

export type OrganizerOverviewStatus = {
  tone: 'blocked' | 'attention' | 'ready' | 'neutral';
  label: string;
};

/**
 * Avoid declaring "On track" when operational health cannot be verified.
 * Stronger evidence of critical risk or unresolved tasks still wins.
 * This is a presentation rule, not a second health authority.
 */
export function organizerOverviewStatus(
  risk: V3OrganizerRisk,
  healthState: V3OrganizerSystemHealth['state'],
): OrganizerOverviewStatus {
  if (risk === 'critical' || healthState === 'outage' || healthState === 'partial_outage') {
    return { tone: 'blocked', label: 'Critical attention' };
  }
  if (risk === 'elevated' || healthState === 'degraded') {
    return { tone: 'attention', label: 'Needs attention' };
  }
  if (healthState === 'unknown') {
    return { tone: 'neutral', label: 'Status unverified' };
  }
  return { tone: 'ready', label: 'On track' };
}

export type OrganizerOverviewEmptyAttention = {
  heading: string;
  description: string;
  verifiedClear: boolean;
};

/** No task rows is not the same as verified normal live operations. */
export function organizerOverviewEmptyAttention(
  risk: V3OrganizerRisk,
  healthState: V3OrganizerSystemHealth['state'],
): OrganizerOverviewEmptyAttention {
  const status = organizerOverviewStatus(risk, healthState);
  if (status.tone === 'ready') {
    return {
      heading: 'Nothing is asking for intervention',
      description: 'No unresolved Organizer Task is listed, and the operational health signal is verified.',
      verifiedClear: true,
    };
  }
  if (status.tone === 'neutral') {
    return {
      heading: 'Operational status not verified',
      description: 'No unresolved Organizer Task is listed, but incident or edition-health evidence is unavailable. Review Control Room before assuming the show is clear.',
      verifiedClear: false,
    };
  }
  return {
    heading: 'Review operational health',
    description: 'No unresolved Organizer Task is listed, but the verified live health or risk signal still requires review in Control Room.',
    verifiedClear: false,
  };
}


export type OrganizerIncidentEscalation = {
  title: string;
  description: string;
};

/**
 * Two exact HEAD counts can observe different database snapshots. If critical
 * incidents are verified but the active total is missing or contradictory,
 * keep the escalation visible without claiming an exact active count.
 */
export function organizerIncidentEscalation(
  active: number | null,
  critical: number | null,
): OrganizerIncidentEscalation | null {
  const valid = (count: number | null): count is number =>
    typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
  const knownActive = valid(active) && !(valid(critical) && critical > active) ? active : null;
  const knownCritical = valid(critical) ? critical : null;
  if (!(knownActive != null && knownActive > 0) && !(knownCritical != null && knownCritical > 0)) {
    return null;
  }
  const criticalDescription = knownCritical != null && knownCritical > 0
    ? `${knownCritical} critical incident${knownCritical === 1 ? '' : 's'} ${knownCritical === 1 ? 'requires' : 'require'} immediate review.`
    : '';
  if (knownActive == null) {
    return {
      title: `${knownCritical} critical incident${knownCritical === 1 ? '' : 's'} confirmed`,
      description: `${criticalDescription} Total active incident count is unverified. Review Incident Command.`,
    };
  }
  return {
    title: `${knownActive} active incident${knownActive === 1 ? '' : 's'}`,
    description: criticalDescription || 'Verified active incident count for the selected edition. Review details and escalation in Incident Command.',
  };
}

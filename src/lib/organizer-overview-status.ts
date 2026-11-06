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

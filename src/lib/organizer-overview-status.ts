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

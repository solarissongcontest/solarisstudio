import type { SolarisCapability } from './permissions-v2';

export const SOLARIS_ROLE_PRESETS = {
  superadmin: [
    'edition.read',
    'edition.manage',
    'edition.archive',
    'confirmation.read',
    'confirmation.manage',
    'entry.read_private',
    'entry.edit',
    'entry.approve',
    'jury.ballots.read',
    'televote.ballots.read',
    'results.preview',
    'results.verify',
    'results.publish',
    'integrity.read',
    'integrity.manage',
    'broadcast.control',
    'governance.vote',
    'rules.edit',
    'incident.manage',
    'communications.send',
    'host.read',
    'host.manage',
  ],
  tsbcExecutive: [
    'edition.read',
    'edition.manage',
    'edition.archive',
    'confirmation.read',
    'entry.read_private',
    'entry.approve',
    'results.preview',
    'results.verify',
    'results.publish',
    'integrity.read',
    'integrity.manage',
    'governance.vote',
    'rules.edit',
    'incident.manage',
    'communications.send',
    'host.read',
    'host.manage',
  ],
  votingSupervisor: [
    'edition.read',
    'jury.ballots.read',
    'televote.ballots.read',
    'results.preview',
    'results.verify',
    'integrity.read',
    'integrity.manage',
    'incident.manage',
  ],
  broadcastOperator: [
    'edition.read',
    'results.preview',
    'broadcast.control',
    'incident.manage',
    'host.read',
  ],
  delegationManager: [
    'edition.read',
    'confirmation.read',
    'confirmation.manage',
    'entry.read_private',
    'entry.edit',
    'entry.approve',
    'communications.send',
  ],
  viewer: ['edition.read'],
} as const satisfies Record<string, readonly SolarisCapability[]>;

export type SolarisRolePreset = keyof typeof SOLARIS_ROLE_PRESETS;

export function capabilitiesForRole(role: SolarisRolePreset): readonly SolarisCapability[] {
  return SOLARIS_ROLE_PRESETS[role];
}

/**
 * Compatibility bridge: existing `organizer` users retain their current broad
 * access until persisted capability grants are rolled out. This prevents the
 * permissions migration from silently locking out the existing Organizer UI.
 */
export function legacyOrganizerCapabilities(): readonly SolarisCapability[] {
  return SOLARIS_ROLE_PRESETS.superadmin;
}

export const SOLARIS_CAPABILITIES = [
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
  'story.read',
  'story.manage',
] as const;

export type SolarisCapability = (typeof SOLARIS_CAPABILITIES)[number];

export type CapabilityGrant = {
  capability: SolarisCapability;
  editionId?: string | null;
  expiresAt?: string | null;
};

export type AuthorizationContext = {
  editionId?: string | null;
  now?: Date;
};

export function hasCapability(
  grants: readonly CapabilityGrant[],
  capability: SolarisCapability,
  context: AuthorizationContext = {},
): boolean {
  const now = context.now ?? new Date();

  return grants.some((grant) => {
    if (grant.capability !== capability) return false;
    if (grant.editionId && grant.editionId !== context.editionId) return false;
    if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime()) return false;
    return true;
  });
}

export function requireCapability(
  grants: readonly CapabilityGrant[],
  capability: SolarisCapability,
  context: AuthorizationContext = {},
): void {
  if (!hasCapability(grants, capability, context)) {
    throw new Error(`Missing Solaris capability: ${capability}`);
  }
}

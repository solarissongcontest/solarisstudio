export const SOLARIS_CAPABILITIES = [
  'edition.read',
  'edition.manage',
  'edition.transition',
  'edition.archive',
  'delegation.read',
  'delegation.manage',
  'confirmation.read',
  'confirmation.manage',
  'entry.read_private',
  'entry.edit',
  'entry.approve',
  'entry.publish',
  'voting.read',
  'voting.manage',
  'jury.ballots.read',
  'jury.ballots.manage',
  'televote.ballots.read',
  'televote.ballots.manage',
  'results.preview',
  'results.verify',
  'results.publish',
  'incident.read',
  'incident.manage',
  'incident.resolve',
  'communications.read',
  'communications.send',
  'communications.manage',
  'rules.read',
  'rules.edit',
  'rules.publish',
  'integrity.read',
  'integrity.manage',
  'integrity.sanction',
  'publishing.read',
  'publishing.manage',
  'publishing.publish',
  'broadcast.read',
  'broadcast.control',
  'broadcast.manage',
  'system.read',
  'system.manage',
  'community.read',
  'community.moderate',
  'rollout.read',
  'rollout.manage',
  'permissions.read',
  'permissions.manage',
  'permissions.audit',
  'governance.vote',
  'host.read',
  'host.manage',
  'story.read',
  'story.manage',
  'world.organization.view_private',
  'world.organization.profile.manage',
  'world.organization.branding.manage',
  'world.organization.settings.manage',
  'world.membership.apply',
  'world.membership.review',
  'world.membership.introduce',
  'world.membership.execute_admission',
  'world.membership.withdraw',
  'world.membership.execute_expulsion',
  'world.membership.suspend',
  'world.representation.manage',
  'world.proxy.request',
  'world.proxy.approve',
  'world.session.create',
  'world.session.manage',
  'world.agenda.manage',
  'world.office.manage',
  'world.office.term.assign',
  'world.office.term.transition',
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
  const nowMs = now.getTime();
  // An invalid clock must not make time-limited grants effectively permanent.
  if (!Number.isFinite(nowMs)) return false;

  return grants.some((grant) => {
    if (grant.capability !== capability) return false;

    // Only null/undefined mean global. An empty or malformed scope must not
    // accidentally authorize a platform-wide operation.
    if (grant.editionId !== null && grant.editionId !== undefined) {
      if (
        typeof grant.editionId !== "string" ||
        !grant.editionId.trim() ||
        grant.editionId !== context.editionId
      ) return false;
    }

    // Treat malformed/empty expiration values as DENY, not as "no expiry".
    // Server/RLS authorization remains authoritative for protected operations.
    if (grant.expiresAt !== null && grant.expiresAt !== undefined) {
      if (typeof grant.expiresAt !== "string" || !grant.expiresAt.trim()) return false;
      const expiresAtMs = Date.parse(grant.expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return false;
    }

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


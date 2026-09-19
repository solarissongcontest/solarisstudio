import {
  SOLARIS_CAPABILITIES,
  type SolarisCapability,
} from '@/lib/permissions-v2';

import {
  createSolarisAuthenticatedClientServer,
  getSolarisAccessTokenServer,
} from './organizer.server';

export type ServerCapabilityContext = {
  userId: string;
  capabilities: readonly SolarisCapability[];
  authoritative: true;
};

function isSolarisCapability(value: unknown): value is SolarisCapability {
  return (
    typeof value === 'string' &&
    (SOLARIS_CAPABILITIES as readonly string[]).includes(value)
  );
}

export async function getSolarisCapabilitiesServer(
  editionId?: string | null,
): Promise<ServerCapabilityContext> {
  const token = getSolarisAccessTokenServer();
  const client = createSolarisAuthenticatedClientServer();

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Not authenticated');

  const userId = userData.user.id;
  const now = new Date().toISOString();

  let grantQuery = (client as any)
    .from('studio2_capability_grants')
    .select('capability, edition_id, expires_at')
    .eq('user_id', userId)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  let assignmentQuery = (client as any)
    .from('studio2_role_assignments')
    .select('role_key, edition_id, expires_at')
    .eq('user_id', userId)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (editionId) {
    grantQuery = grantQuery.or(`edition_id.is.null,edition_id.eq.${editionId}`);
    assignmentQuery = assignmentQuery.or(
      `edition_id.is.null,edition_id.eq.${editionId}`,
    );
  } else {
    grantQuery = grantQuery.is('edition_id', null);
    assignmentQuery = assignmentQuery.is('edition_id', null);
  }

  const [
    { data: grants, error: grantError },
    { data: assignments, error: assignmentError },
  ] = await Promise.all([grantQuery, assignmentQuery]);

  if (grantError) throw grantError;
  if (assignmentError) throw assignmentError;

  const roleKeys = Array.from(
    new Set(
      ((assignments ?? []) as Array<{ role_key: string }>).map(
        (assignment) => assignment.role_key,
      ),
    ),
  );

  let roleCapabilities: Array<{ capability: string }> = [];
  if (roleKeys.length > 0) {
    const { data, error } = await (client as any)
      .from('studio2_role_capabilities')
      .select('capability')
      .in('role_key', roleKeys);

    if (error) throw error;
    roleCapabilities = (data ?? []) as Array<{ capability: string }>;
  }

  const capabilities = Array.from(
    new Set(
      [
        ...((grants ?? []) as Array<{ capability: string }>).map(
          (grant) => grant.capability,
        ),
        ...roleCapabilities.map((row) => row.capability),
      ].filter(isSolarisCapability),
    ),
  );

  return {
    userId,
    capabilities,
    authoritative: true,
  };
}

export async function requireSolarisCapabilityServer(
  capability: SolarisCapability,
  editionId?: string | null,
): Promise<ServerCapabilityContext> {
  const context = await getSolarisCapabilitiesServer(editionId);
  if (!context.capabilities.includes(capability)) {
    throw new Error(`Solaris capability required: ${capability}`);
  }
  return context;
}

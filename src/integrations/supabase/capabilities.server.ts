import type { SolarisCapability } from '@/lib/permissions-v2';
import { legacyOrganizerCapabilities } from '@/lib/role-presets';

import {
  createSolarisAuthenticatedClientServer,
  getSolarisAccessTokenServer,
} from './organizer.server';

function missingSchema(error: unknown) {
  const text = String((error as { message?: string })?.message ?? error ?? '').toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('pgrst205')
  );
}

export type ServerCapabilityContext = {
  userId: string;
  capabilities: readonly SolarisCapability[];
  legacyOrganizerFallback: boolean;
};

export async function getSolarisCapabilitiesServer(
  editionId?: string | null,
): Promise<ServerCapabilityContext> {
  const token = getSolarisAccessTokenServer();
  const client = createSolarisAuthenticatedClientServer();

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Not authenticated');

  const now = new Date().toISOString();
  let grantQuery = (client as any)
    .from('capability_grants')
    .select('capability, edition_id, expires_at')
    .eq('user_id', userData.user.id)
    .or(`expires_at.is.null,expires_at.gt.${now}`);

  if (editionId) {
    grantQuery = grantQuery.or(`edition_id.is.null,edition_id.eq.${editionId}`);
  } else {
    grantQuery = grantQuery.is('edition_id', null);
  }

  const { data: grants, error: grantError } = await grantQuery;

  if (!grantError) {
    const capabilities = Array.from(
      new Set(
        ((grants ?? []) as Array<{ capability: SolarisCapability }>).map(
          (grant) => grant.capability,
        ),
      ),
    );

    if (capabilities.length > 0) {
      return {
        userId: userData.user.id,
        capabilities,
        legacyOrganizerFallback: false,
      };
    }
  } else if (!missingSchema(grantError)) {
    throw grantError;
  }

  // Compatibility path while the capability table is rolled out. This is a
  // deliberate bridge, not authorization by client metadata: the organizer
  // role is still checked in the database under the user's authenticated JWT.
  const { data: organizerRole, error: roleError } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .eq('role', 'organizer')
    .maybeSingle();

  if (roleError) throw roleError;

  return {
    userId: userData.user.id,
    capabilities: organizerRole ? legacyOrganizerCapabilities() : [],
    legacyOrganizerFallback: Boolean(organizerRole),
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

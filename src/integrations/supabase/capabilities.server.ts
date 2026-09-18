import type { SolarisCapability } from '@/lib/permissions-v2';

import {
  createSolarisAuthenticatedClientServer,
  getSolarisAccessTokenServer,
} from './organizer.server';

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

  const { data, error } = await (client as any).rpc('studio2_current_capabilities', {
    p_edition_id: editionId ?? null,
  });
  if (error) throw error;

  return {
    userId: userData.user.id,
    capabilities: (Array.isArray(data) ? data : []) as SolarisCapability[],
    legacyOrganizerFallback: false,
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

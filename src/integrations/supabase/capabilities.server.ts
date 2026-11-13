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

// The scope enters server functions from request data. Never interpolate an
// unvalidated value into a PostgREST logical filter or reinterpret an empty
// string as global authority.
const EDITION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ScopedCapabilityRow = { edition_id: string | null; expires_at: string | null };

function activeInScope(row: ScopedCapabilityRow, editionId: string | null, nowMs: number): boolean {
  if (!row || typeof row !== 'object' ||
      (row.edition_id !== null && row.edition_id !== editionId)) return false;
  if (row.expires_at === null) return true;
  if (typeof row.expires_at !== 'string' || !row.expires_at.trim()) return false;
  const expiryMs = Date.parse(row.expires_at);
  return Number.isFinite(expiryMs) && expiryMs > nowMs;
}

export async function getSolarisCapabilitiesServer(
  editionId?: string | null,
): Promise<ServerCapabilityContext> {
  if (editionId != null && (typeof editionId !== 'string' || !EDITION_UUID.test(editionId))) {
    throw new Error('Invalid edition scope');
  }
  const scope = editionId?.toLowerCase() ?? null;
  const token = getSolarisAccessTokenServer();
  const client = createSolarisAuthenticatedClientServer();

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Not authenticated');

  const userId = userData.user.id;
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();

  let grantQuery = (client as any)
    .from('studio2_capability_grants')
    .select('capability, edition_id, expires_at')
    .eq('user_id', userId);

  let assignmentQuery = (client as any)
    .from('studio2_role_assignments')
    .select('role_key, edition_id, expires_at')
    .eq('user_id', userId);

  if (scope) {
    // One scope OR per table. PostgREST URL builders can otherwise replace or
    // combine independent OR parameters unexpectedly. Expiry is rechecked
    // against the actual returned rows below, regardless of query behavior.
    grantQuery = grantQuery.or(`edition_id.is.null,edition_id.eq.${scope}`);
    assignmentQuery = assignmentQuery.or(`edition_id.is.null,edition_id.eq.${scope}`);
  } else {
    grantQuery = grantQuery.is('edition_id', null).or(`expires_at.is.null,expires_at.gt.${now}`);
    assignmentQuery = assignmentQuery.is('edition_id', null).or(`expires_at.is.null,expires_at.gt.${now}`);
  }

  const [
    { data: grants, error: grantError },
    { data: assignments, error: assignmentError },
  ] = await Promise.all([grantQuery, assignmentQuery]);

  if (grantError) throw grantError;
  if (assignmentError) throw assignmentError;

  // Treat the database filter as a narrowing optimization, not the final
  // authorization decision. A malformed or unexpectedly broad PostgREST
  // result must never confer expired or cross-edition capabilities.
  const scopedGrants = ((grants ?? []) as Array<ScopedCapabilityRow & { capability: string }>)
    .filter((grant) => activeInScope(grant, scope, nowMs));
  const scopedAssignments = ((assignments ?? []) as Array<ScopedCapabilityRow & { role_key: string }>)
    .filter((assignment) => activeInScope(assignment, scope, nowMs));

  const roleKeys = Array.from(
    new Set(scopedAssignments.map((assignment) => assignment.role_key)),
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
        ...scopedGrants.map((grant) => grant.capability),
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

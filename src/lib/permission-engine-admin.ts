import { supabase } from "@/integrations/supabase/client";

import { SOLARIS_CAPABILITIES, type SolarisCapability } from "./permissions-v2";

export type PermissionAccessLevel = "read" | "operate" | "approve" | "administer";

export type PermissionCapability = {
  key: SolarisCapability;
  domain: string;
  label: string;
  description: string;
  accessLevel: PermissionAccessLevel;
};

export type PermissionRole = {
  key: string;
  label: string;
  description: string;
  capabilities: SolarisCapability[];
};

export type AccessRoleAssignment = {
  id: string;
  roleKey: string;
  editionId: string | null;
  editionName: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type DirectCapabilityGrant = {
  id: string;
  capability: SolarisCapability;
  editionId: string | null;
  editionName: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type AccessUser = {
  userId: string;
  displayName: string;
  email: string | null;
  legacyRoles: string[];
  assignments: AccessRoleAssignment[];
  directGrants: DirectCapabilityGrant[];
};

export type PermissionSummary = {
  windowDays: number;
  evaluations: number;
  matched: number;
  mismatched: number;
  legacyAllowedCapabilityDenied: number;
  legacyDeniedCapabilityAllowed: number;
};

export type PermissionEvent = {
  id: number;
  userId: string | null;
  displayName: string;
  editionId: string | null;
  editionName: string | null;
  capability: SolarisCapability;
  legacyAllowed: boolean;
  capabilityAllowed: boolean;
  action: string;
  route: string | null;
  createdAt: string;
};

export type AccessSimulation = {
  userId: string;
  editionId: string | null;
  roles: string[];
  capabilities: SolarisCapability[];
  readOnly: true;
};

export type PermissionCatalog = {
  capabilities: PermissionCapability[];
  roles: PermissionRole[];
};

type RpcResult = PromiseLike<{ data: unknown; error: unknown }>;
type PermissionRpcClient = {
  rpc(name: string, args?: Record<string, unknown>): RpcResult;
};

const client = supabase as unknown as PermissionRpcClient;
const capabilitySet = new Set<string>(SOLARIS_CAPABILITIES);
const accessLevelSet = new Set<string>(["read", "operate", "approve", "administer"]);

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${label}`);
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Invalid ${label}`);
  return value;
}

function capability(value: unknown): SolarisCapability {
  const candidate = string(value, "capability");
  if (!capabilitySet.has(candidate)) throw new Error(`Unknown Solaris capability: ${candidate}`);
  return candidate as SolarisCapability;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function capabilityArray(value: unknown): SolarisCapability[] {
  return stringArray(value).map(capability);
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "Permission Engine request failed.";
}

async function rpc(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(errorMessage(error));
  return data;
}

function mapCapability(value: unknown): PermissionCapability {
  const row = object(value, "permission capability");
  const accessLevel = string(row.access_level, "access level");
  if (!accessLevelSet.has(accessLevel))
    throw new Error(`Unknown permission access level: ${accessLevel}`);
  return {
    key: capability(row.key),
    domain: string(row.domain, "capability domain"),
    label: string(row.label, "capability label"),
    description: string(row.description, "capability description"),
    accessLevel: accessLevel as PermissionAccessLevel,
  };
}

function mapRole(value: unknown): PermissionRole {
  const row = object(value, "permission role");
  return {
    key: string(row.key, "role key"),
    label: string(row.label, "role label"),
    description: string(row.description, "role description"),
    capabilities: capabilityArray(row.capabilities),
  };
}

function mapAssignment(value: unknown): AccessRoleAssignment {
  const row = object(value, "role assignment");
  return {
    id: string(row.id, "role assignment id"),
    roleKey: string(row.roleKey, "role key"),
    editionId: nullableString(row.editionId),
    editionName: nullableString(row.editionName),
    expiresAt: nullableString(row.expiresAt),
    createdAt: string(row.createdAt, "role assignment created at"),
  };
}

function mapGrant(value: unknown): DirectCapabilityGrant {
  const row = object(value, "direct capability grant");
  return {
    id: string(row.id, "direct capability grant id"),
    capability: capability(row.capability),
    editionId: nullableString(row.editionId),
    editionName: nullableString(row.editionName),
    expiresAt: nullableString(row.expiresAt),
    createdAt: string(row.createdAt, "direct capability grant created at"),
  };
}

function mapUser(value: unknown): AccessUser {
  const row = object(value, "access user");
  return {
    userId: string(row.user_id, "access user id"),
    displayName: string(row.display_name, "access user display name"),
    email: nullableString(row.email),
    legacyRoles: stringArray(row.legacy_roles),
    assignments: array(row.assignments).map(mapAssignment),
    directGrants: array(row.direct_grants).map(mapGrant),
  };
}

function mapSummary(value: unknown): PermissionSummary {
  const row = object(value, "permission summary");
  return {
    windowDays: number(row.windowDays, "summary window"),
    evaluations: number(row.evaluations, "evaluation count"),
    matched: number(row.matched, "matched count"),
    mismatched: number(row.mismatched, "mismatch count"),
    legacyAllowedCapabilityDenied: number(
      row.legacyAllowedCapabilityDenied,
      "legacy allow mismatch count",
    ),
    legacyDeniedCapabilityAllowed: number(
      row.legacyDeniedCapabilityAllowed,
      "capability allow mismatch count",
    ),
  };
}

function mapEvent(value: unknown): PermissionEvent {
  const row = object(value, "permission event");
  return {
    id: number(row.id, "permission event id"),
    userId: nullableString(row.user_id),
    displayName: string(row.display_name, "permission event user"),
    editionId: nullableString(row.edition_id),
    editionName: nullableString(row.edition_name),
    capability: capability(row.capability),
    legacyAllowed: boolean(row.legacy_allowed, "legacy decision"),
    capabilityAllowed: boolean(row.capability_allowed, "capability decision"),
    action: string(row.action, "permission action"),
    route: nullableString(row.route),
    createdAt: string(row.created_at, "permission event created at"),
  };
}

export async function loadPermissionCatalog(): Promise<PermissionCatalog> {
  const row = object(await rpc("studio2_permission_catalog"), "permission catalog");
  return {
    capabilities: array(row.capabilities).map(mapCapability),
    roles: array(row.roles).map(mapRole),
  };
}

export async function loadAccessUsers(): Promise<AccessUser[]> {
  return array(await rpc("studio2_access_users")).map(mapUser);
}

export async function loadPermissionSummary(): Promise<PermissionSummary> {
  return mapSummary(await rpc("studio2_permission_summary"));
}

export async function loadPermissionEvents(mismatchesOnly = false): Promise<PermissionEvent[]> {
  return array(
    await rpc("studio2_permission_events", {
      p_limit: 200,
      p_mismatches_only: mismatchesOnly,
    }),
  ).map(mapEvent);
}

export async function assignAccessRole(input: {
  userId: string;
  roleKey: string;
  editionId?: string | null;
  expiresAt?: string | null;
}): Promise<void> {
  await rpc("studio2_assign_access_role", {
    p_user_id: input.userId,
    p_role_key: input.roleKey,
    p_edition_id: input.editionId ?? null,
    p_expires_at: input.expiresAt ?? null,
  });
}

export async function revokeAccessRole(input: {
  userId: string;
  roleKey: string;
  editionId?: string | null;
}): Promise<void> {
  await rpc("studio2_revoke_access_role", {
    p_user_id: input.userId,
    p_role_key: input.roleKey,
    p_edition_id: input.editionId ?? null,
  });
}

export async function grantDirectCapability(input: {
  userId: string;
  capability: SolarisCapability;
  editionId?: string | null;
  expiresAt?: string | null;
}): Promise<void> {
  await rpc("studio2_grant_capability", {
    p_user_id: input.userId,
    p_capability: input.capability,
    p_edition_id: input.editionId ?? null,
    p_expires_at: input.expiresAt ?? null,
  });
}

export async function revokeDirectCapability(input: {
  userId: string;
  capability: SolarisCapability;
  editionId?: string | null;
}): Promise<void> {
  await rpc("studio2_revoke_capability", {
    p_user_id: input.userId,
    p_capability: input.capability,
    p_edition_id: input.editionId ?? null,
  });
}

export async function viewAccessAs(
  userId: string,
  editionId?: string | null,
): Promise<AccessSimulation> {
  const row = object(
    await rpc("studio2_view_access_as", {
      p_user_id: userId,
      p_edition_id: editionId ?? null,
    }),
    "access simulation",
  );
  return {
    userId: string(row.userId, "simulation user id"),
    editionId: nullableString(row.editionId),
    roles: stringArray(row.roles),
    capabilities: capabilityArray(row.capabilities),
    readOnly: true,
  };
}

export async function recordPermissionEvaluation(input: {
  capability: SolarisCapability;
  editionId?: string | null;
  action: string;
  route: string;
}): Promise<void> {
  await rpc("studio2_check_capability_shadow", {
    p_capability: input.capability,
    p_edition_id: input.editionId ?? null,
    p_action: input.action,
    p_route: input.route,
  });
}

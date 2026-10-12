import type { V3OrganizerContext } from './v3-organizer-ia';

export type V3OrganizerControlDomain =
  | 'delegations'
  | 'contest'
  | 'voting'
  | 'results'
  | 'publication'
  | 'broadcast';

export type V3OrganizerControlWorkspace = {
  id: string;
  label: string;
  description: string;
  route: string;
  availability: 'available' | 'blocked' | 'hidden';
  blockedReason?: string | null;
};

export type V3OrganizerControlModuleInput = {
  domain: V3OrganizerControlDomain;
  label: string;
  description: string;
  availability: 'available' | 'blocked' | 'hidden';
  blockedReason?: string | null;
  workspaces: readonly V3OrganizerControlWorkspace[];
};

export type V3OrganizerControlModule = {
  domain: V3OrganizerControlDomain;
  label: string;
  description: string;
  availability: 'available' | 'blocked';
  blockedReason: string | null;
  workspaces: readonly V3OrganizerControlWorkspace[];
};

export type V3OrganizerControlProjection = {
  context: V3OrganizerContext;
  modules: readonly V3OrganizerControlModule[];
  availableModuleCount: number;
  blockedModuleCount: number;
};

export const V3_ORGANIZER_CONTROL_DOMAIN_ORDER: readonly V3OrganizerControlDomain[] = [
  'delegations',
  'contest',
  'voting',
  'results',
  'publication',
  'broadcast',
];

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must be non-empty.`);
  return normalized;
}

function normalizeBlockedReason(
  availability: 'available' | 'blocked' | 'hidden',
  reason: string | null | undefined,
  label: string,
): string | null {
  const normalized = reason?.trim() || null;
  if (availability === 'blocked' && !normalized) {
    throw new Error(`${label} must explain why it is blocked.`);
  }
  return normalized;
}

function normalizeWorkspace(
  workspace: V3OrganizerControlWorkspace,
  moduleAvailability: 'available' | 'blocked',
  moduleBlockedReason: string | null,
): V3OrganizerControlWorkspace | null {
  if (workspace.availability === 'hidden') return null;

  const id = required(workspace.id, 'workspace id');
  const label = required(workspace.label, 'workspace label');
  const description = required(workspace.description, 'workspace description');
  const route = required(workspace.route, 'workspace route');

  if (!route.startsWith('/')) {
    throw new Error(`Workspace ${id} must use an internal Solaris route.`);
  }

  if (moduleAvailability === 'blocked') {
    return {
      id,
      label,
      description,
      route,
      availability: 'blocked',
      blockedReason: moduleBlockedReason,
    };
  }

  return {
    id,
    label,
    description,
    route,
    availability: workspace.availability,
    blockedReason: normalizeBlockedReason(
      workspace.availability,
      workspace.blockedReason,
      `Workspace ${id}`,
    ),
  };
}

export function buildV3OrganizerControlProjection(input: {
  context: V3OrganizerContext;
  modules: readonly V3OrganizerControlModuleInput[];
}): V3OrganizerControlProjection {
  const seenDomains = new Set<V3OrganizerControlDomain>();
  const seenWorkspaceIds = new Set<string>();

  const modules = input.modules
    .filter((module) => module.availability !== 'hidden')
    .map((module): V3OrganizerControlModule => {
      if (seenDomains.has(module.domain)) {
        throw new Error(`Duplicate Organizer Control domain: ${module.domain}`);
      }
      seenDomains.add(module.domain);

      const availability = module.availability as 'available' | 'blocked';
      const blockedReason = normalizeBlockedReason(
        module.availability,
        module.blockedReason,
        `Control module ${module.domain}`,
      );

      const workspaces = module.workspaces
        .map((workspace) => normalizeWorkspace(workspace, availability, blockedReason))
        .filter((workspace): workspace is V3OrganizerControlWorkspace => workspace != null)
        .map((workspace) => {
          if (seenWorkspaceIds.has(workspace.id)) {
            throw new Error(`Duplicate Organizer Control workspace: ${workspace.id}`);
          }
          seenWorkspaceIds.add(workspace.id);
          return workspace;
        });

      return {
        domain: module.domain,
        label: required(module.label, `Control module ${module.domain} label`),
        description: required(module.description, `Control module ${module.domain} description`),
        availability,
        blockedReason,
        workspaces,
      };
    })
    .sort(
      (left, right) =>
        V3_ORGANIZER_CONTROL_DOMAIN_ORDER.indexOf(left.domain) -
        V3_ORGANIZER_CONTROL_DOMAIN_ORDER.indexOf(right.domain),
    );

  return {
    context: { ...input.context },
    modules,
    availableModuleCount: modules.filter((module) => module.availability === 'available').length,
    blockedModuleCount: modules.filter((module) => module.availability === 'blocked').length,
  };
}

/**
 * Control is navigation into authoritative workspaces, not a mutation surface.
 * Confirmation/re-authentication/risk/undo policy belongs to the dedicated
 * Organizer safety layer when the user reaches an actual operation.
 */
export const V3_ORGANIZER_CONTROL_POLICY = Object.freeze({
  directMutationFromControlTile: false,
  advancedDiagnosticsOwner: 'more' as const,
  liveOperationsOwner: 'live' as const,
  exceptionQueueOwner: 'tasks' as const,
});

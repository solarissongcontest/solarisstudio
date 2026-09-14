import type { SolarisCapability } from "./permissions-v2";

export type SimulatedAccessItem = {
  label: string;
  path?: string;
  capability: SolarisCapability;
  allowed: boolean;
};

export type SimulatedOrganizerSurface = {
  id: OrganizerSurfaceId;
  label: string;
  description: string;
  visible: boolean;
  routes: SimulatedAccessItem[];
  actions: SimulatedAccessItem[];
};

export type OrganizerAccessSimulation = {
  surfaces: SimulatedOrganizerSurface[];
  visibleSurfaceCount: number;
  allowedRouteCount: number;
  enabledActionCount: number;
};

type OrganizerSurfaceId =
  | "overview"
  | "contest"
  | "operations"
  | "voting-results"
  | "rules-integrity"
  | "publishing"
  | "administration";

type AccessItemDefinition = Omit<SimulatedAccessItem, "allowed">;

type OrganizerSurfaceDefinition = {
  id: OrganizerSurfaceId;
  label: string;
  description: string;
  routes: AccessItemDefinition[];
  actions: AccessItemDefinition[];
};

export const ORGANIZER_ACCESS_SURFACES: readonly OrganizerSurfaceDefinition[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Edition status, priorities and next actions.",
    routes: [route("Organizer overview", "/admin/operations", "edition.read")],
    actions: [action("Change edition settings", "edition.manage")],
  },
  {
    id: "contest",
    label: "Contest",
    description: "Delegations, entries, hosting and eligibility.",
    routes: [
      route("Delegations", "/admin/countries", "delegation.read"),
      route("Private entries", "/admin/entries", "entry.read_private"),
      route("Host", "/admin/hosts", "host.read"),
      route("Confirmations", "/confirmations/admin", "confirmation.read"),
    ],
    actions: [
      action("Manage delegations", "delegation.manage"),
      action("Approve entries", "entry.approve"),
      action("Manage host delivery", "host.manage"),
    ],
  },
  {
    id: "operations",
    label: "Operations",
    description: "Live control, workflows, incidents and communications.",
    routes: [
      route("Control Room", "/admin/control-room", "edition.read"),
      route("Incidents", "/admin/incidents", "incident.read"),
      route("Communications", "/admin/communications", "communications.read"),
      route("Broadcast rundown", "/admin/broadcast-rundown", "broadcast.read"),
    ],
    actions: [
      action("Transition edition state", "edition.transition"),
      action("Resolve incidents", "incident.resolve"),
      action("Send communications", "communications.send"),
      action("Operate broadcast cues", "broadcast.control"),
    ],
  },
  {
    id: "voting-results",
    label: "Voting & Results",
    description: "Voting operations, protected ballots and result release.",
    routes: [
      route("Voting operations", "/televoting/admin", "voting.read"),
      route("Jury ballots", "/admin/jury", "jury.ballots.read"),
      route("Televote ballots", "/admin/televote", "televote.ballots.read"),
      route("Results preview", "/admin/results", "results.preview"),
    ],
    actions: [
      action("Manage voting", "voting.manage"),
      action("Correct jury ballots", "jury.ballots.manage"),
      action("Verify results", "results.verify"),
      action("Publish results", "results.publish"),
    ],
  },
  {
    id: "rules-integrity",
    label: "Rules & Integrity",
    description: "Rules, interpretations, investigations and sanctions.",
    routes: [
      route("Rules", "/admin/rules-manager", "rules.read"),
      route("Integrity cases", "/admin/integrity-investigations", "integrity.read"),
    ],
    actions: [
      action("Edit rules", "rules.edit"),
      action("Publish rulebook", "rules.publish"),
      action("Manage investigations", "integrity.manage"),
      action("Apply sanctions", "integrity.sanction"),
    ],
  },
  {
    id: "publishing",
    label: "Publishing",
    description: "Stories, media, public release controls and design.",
    routes: [
      route("Storytelling", "/admin/storytelling", "story.read"),
      route("Media and publication", "/admin/media-assets", "publishing.read"),
      route("Broadcast design", "/admin/design", "broadcast.read"),
    ],
    actions: [
      action("Manage stories", "story.manage"),
      action("Prepare publication", "publishing.manage"),
      action("Publish public content", "publishing.publish"),
      action("Manage broadcast design", "broadcast.manage"),
    ],
  },
  {
    id: "administration",
    label: "Administration",
    description: "Access, rollout and system configuration.",
    routes: [
      route("Access & permissions", "/admin/access-permissions", "permissions.read"),
      route("Feature rollout", "/admin/feature-rollout", "rollout.read"),
      route("Edition administration", "/admin", "edition.read"),
    ],
    actions: [
      action("Manage access", "permissions.manage"),
      action("Audit permissions", "permissions.audit"),
      action("Manage feature rollout", "rollout.manage"),
      action("Archive editions", "edition.archive"),
    ],
  },
] as const;

export function buildOrganizerAccessSimulation(
  capabilities: readonly SolarisCapability[],
): OrganizerAccessSimulation {
  const granted = new Set<SolarisCapability>(capabilities);
  const surfaces = ORGANIZER_ACCESS_SURFACES.map((surface) => {
    const routes = surface.routes.map((item) => ({
      ...item,
      allowed: granted.has(item.capability),
    }));
    const actions = surface.actions.map((item) => ({
      ...item,
      allowed: granted.has(item.capability),
    }));
    return {
      ...surface,
      visible: routes.some((item) => item.allowed),
      routes,
      actions,
    };
  });

  return {
    surfaces,
    visibleSurfaceCount: surfaces.filter((surface) => surface.visible).length,
    allowedRouteCount: surfaces.flatMap((surface) => surface.routes).filter((item) => item.allowed)
      .length,
    enabledActionCount: surfaces
      .flatMap((surface) => surface.actions)
      .filter((item) => item.allowed).length,
  };
}

function route(label: string, path: string, capability: SolarisCapability): AccessItemDefinition {
  return { label, path, capability };
}

function action(label: string, capability: SolarisCapability): AccessItemDefinition {
  return { label, capability };
}

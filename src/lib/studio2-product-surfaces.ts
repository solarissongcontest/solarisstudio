import type { SolarisFeatureFlag } from "./feature-flags";

export type Studio2SurfaceState =
  | "foundation"
  | "integrated"
  | "product_surface"
  | "planned"
  | "external_workstream";

export type Studio2Audience = "system" | "organizer" | "delegation" | "public";

export type Studio2ProductSurface = {
  key: SolarisFeatureFlag;
  label: string;
  state: Studio2SurfaceState;
  audience: Studio2Audience;
  description: string;
  route?: string;
  surfaceLabel?: string;
  dependsOn?: readonly SolarisFeatureFlag[];
};

export type Studio2RolloutDecision = {
  allowed: boolean;
  blockingKeys: SolarisFeatureFlag[];
  reason: "allowed" | "rollout_locked" | "missing_dependencies" | "active_dependents";
};

export const STUDIO2_PRODUCT_SURFACES: Readonly<Record<SolarisFeatureFlag, Studio2ProductSurface>> =
  {
    edition_state_engine: {
      key: "edition_state_engine",
      label: "Edition State Engine",
      state: "foundation",
      audience: "system",
      description:
        "Canonical edition lifecycle and legal transition graph used by operational surfaces.",
    },
    contest_event_engine: {
      key: "contest_event_engine",
      label: "Contest Event Engine",
      state: "foundation",
      audience: "system",
      description:
        "Canonical event vocabulary and event-stream foundation for Studio 2 operations.",
    },
    permission_engine_v2: {
      key: "permission_engine_v2",
      label: "Permission Engine v2",
      state: "foundation",
      audience: "system",
      description:
        "Capability-based authorization foundation for progressively replacing broad role checks.",
    },
    workflow_engine: {
      key: "workflow_engine",
      label: "Workflow Engine",
      state: "product_surface",
      audience: "organizer",
      route: "/admin/workflows",
      surfaceLabel: "Workflows",
      description:
        "Organizer workflow operations derived from canonical contest state and evaluated by the shared Workflow Engine.",
    },
    official_communications: {
      key: "official_communications",
      label: "Official Communications",
      state: "product_surface",
      audience: "organizer",
      route: "/admin/communications",
      description: "Organizer notice composer, history and acknowledgement tracking.",
    },
    hod_workspace_v2: {
      key: "hod_workspace_v2",
      label: "HOD Workspace v2",
      state: "product_surface",
      audience: "delegation",
      route: "/my-solaris/tasks",
      description: "Delegation operations workspace for entry, jury and notice tasks.",
    },
    live_control_room: {
      key: "live_control_room",
      label: "Live Control Room",
      state: "product_surface",
      audience: "organizer",
      route: "/admin/control-room",
      dependsOn: ["edition_state_engine", "contest_event_engine"],
      description:
        "Persisted lifecycle state, incidents, event stream and guarded edition transitions.",
    },
    incident_command: {
      key: "incident_command",
      label: "Incident Command",
      state: "product_surface",
      audience: "organizer",
      route: "/admin/incidents",
      surfaceLabel: "Incidents",
      dependsOn: ["live_control_room"],
      description:
        "Dedicated incident command surface for triage, acknowledgement, command, timeline, crisis, resolution and postmortem work.",
    },
    broadcast_rundown: {
      key: "broadcast_rundown",
      label: "Broadcast Rundown",
      state: "product_surface",
      audience: "organizer",
      route: "/admin/broadcast-rundown",
      description: "Persisted show rundown planner and timing/drift analysis.",
    },
    results_replay: {
      key: "results_replay",
      label: "Results Replay",
      state: "product_surface",
      audience: "organizer",
      route: "/admin/results-reveal",
      surfaceLabel: "Reveal Director",
      description:
        "Read-only reveal strategy comparison, suspense analysis and certainty timeline.",
    },
    voting_lab: {
      key: "voting_lab",
      label: "Voting Laboratory",
      state: "product_surface",
      audience: "organizer",
      route: "/admin/voting-lab",
      description:
        "Privacy-safe simulation of alternate voting constraints over sanitized real ballots.",
    },
    edition_simulator: {
      key: "edition_simulator",
      label: "Edition Simulator",
      state: "product_surface",
      audience: "organizer",
      route: "/admin/edition-simulator",
      surfaceLabel: "Simulator",
      dependsOn: ["edition_state_engine", "live_control_room"],
      description:
        "In-memory operational rehearsal using the current Control Room state as a starting point.",
    },
    rules_engine: {
      key: "rules_engine",
      label: "Rules Engine",
      state: "external_workstream",
      audience: "public",
      description:
        "Owned by the separate Rules Hub + Trust & Integrity workstream and intentionally not rolled out here.",
    },
    public_encyclopedia: {
      key: "public_encyclopedia",
      label: "Public Encyclopedia",
      state: "product_surface",
      audience: "public",
      route: "/encyclopedia",
      description:
        "Publication-safe historical reference across editions, countries, entries, artists, shows and results.",
    },
    public_ia_v3: {
      key: "public_ia_v3",
      label: "Public IA v3",
      state: "product_surface",
      audience: "public",
      description:
        "Reversible public navigation and information-architecture rollout for the five-area Solaris shell.",
    },
    country_voting_dna: {
      key: "country_voting_dna",
      label: "Country Voting DNA",
      state: "product_surface",
      audience: "public",
      route: "/voting-dna",
      description:
        "Descriptive country voting and result profiles derived only from published public archive data.",
    },
    prediction_league: {
      key: "prediction_league",
      label: "Prediction League",
      state: "product_surface",
      audience: "public",
      route: "/prediction-league",
      description:
        "Scored competition layer over Prediction Arena with versioned scoring and privacy-safe leaderboards.",
    },
    fantasy_ssc: {
      key: "fantasy_ssc",
      label: "Fantasy SSC",
      state: "product_surface",
      audience: "public",
      route: "/fantasy",
      dependsOn: ["prediction_league"],
      description:
        "Budget-limited roster game with server-time locking, versioned scoring and published-result leaderboards.",
    },
    time_machine: {
      key: "time_machine",
      label: "Time Machine",
      state: "product_surface",
      audience: "organizer",
      route: "/admin/time-machine",
      dependsOn: ["contest_event_engine", "permission_engine_v2"],
      description:
        "Read-only historical reconstruction from recorded contest events and audit markers.",
    },
    solaris_command_assistant: {
      key: "solaris_command_assistant",
      label: "Solaris Command Assistant",
      state: "product_surface",
      audience: "organizer",
      route: "/admin/command-assistant",
      dependsOn: ["permission_engine_v2"],
      description:
        "Read-only natural-language command registry over canonical Organizer routes and live bounded summaries.",
    },
  };

export const STUDIO2_PRODUCT_SURFACE_LIST = Object.values(STUDIO2_PRODUCT_SURFACES);

export function studio2SurfaceFor(key: SolarisFeatureFlag): Studio2ProductSurface {
  return STUDIO2_PRODUCT_SURFACES[key];
}

export function studio2SurfaceRolloutEligible(surface: Studio2ProductSurface): boolean {
  return surface.state !== "planned" && surface.state !== "external_workstream";
}

export function studio2MissingDependencies(
  key: SolarisFeatureFlag,
  enabledKeys: ReadonlySet<SolarisFeatureFlag>,
): SolarisFeatureFlag[] {
  return [...(STUDIO2_PRODUCT_SURFACES[key].dependsOn ?? [])].filter(
    (dependency) => !enabledKeys.has(dependency),
  );
}

export function studio2EnabledDependents(
  key: SolarisFeatureFlag,
  enabledKeys: ReadonlySet<SolarisFeatureFlag>,
): SolarisFeatureFlag[] {
  return STUDIO2_PRODUCT_SURFACE_LIST.filter(
    (surface) => enabledKeys.has(surface.key) && surface.dependsOn?.includes(key),
  ).map((surface) => surface.key);
}

export function studio2RolloutDecision(
  key: SolarisFeatureFlag,
  currentlyEnabled: boolean,
  enabledKeys: ReadonlySet<SolarisFeatureFlag>,
): Studio2RolloutDecision {
  const surface = studio2SurfaceFor(key);

  if (!currentlyEnabled) {
    if (!studio2SurfaceRolloutEligible(surface)) {
      return { allowed: false, blockingKeys: [], reason: "rollout_locked" };
    }

    const missing = studio2MissingDependencies(key, enabledKeys);
    if (missing.length) {
      return { allowed: false, blockingKeys: missing, reason: "missing_dependencies" };
    }

    return { allowed: true, blockingKeys: [], reason: "allowed" };
  }

  const dependents = studio2EnabledDependents(key, enabledKeys);
  if (dependents.length) {
    return { allowed: false, blockingKeys: dependents, reason: "active_dependents" };
  }

  return { allowed: true, blockingKeys: [], reason: "allowed" };
}

export function studio2SurfaceStateLabel(state: Studio2SurfaceState): string {
  switch (state) {
    case "product_surface":
      return "Product surface";
    case "integrated":
      return "Integrated";
    case "foundation":
      return "Foundation";
    case "external_workstream":
      return "External workstream";
    case "planned":
      return "Planned";
  }
}

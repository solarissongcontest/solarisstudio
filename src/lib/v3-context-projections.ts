import type { SolarisTask, SolarisTaskKind, SolarisTaskState } from "./participation-os";
import {
  projectV3Experience,
  type V3DomainSnapshot,
  type V3ExperienceProjection,
} from "./v3-domain-state";
import {
  projectV3Actions,
  projectV3Attention,
  type V3ActionProjection,
  type V3AttentionProjection,
} from "./v3-experience";

export const V3_SCHEMA_VERSION = "v3.1" as const;

export type V3PrimaryContext = {
  editionId: string | null;
  showId?: string | null;
  delegationId?: string | null;
};

export type V3CurrentContestProjection = {
  edition: {
    id: string;
    label: string;
    host?: string | null;
  };
  domains: V3DomainSnapshot;
  experience: V3ExperienceProjection;
  nextEvent?: {
    id: string;
    label: string;
    startsAt: string;
  } | null;
  liveState?: {
    showId: string;
    currentPosition?: number | null;
    totalPositions?: number | null;
  } | null;
  stateVersion: string | number | null;
  serverTime: string;
};

export type V3JourneyState =
  | "complete"
  | "active"
  | "waiting"
  | "locked"
  | "problem";

export type V3JourneyResponsibility = {
  kind: "confirmation" | "entry" | "media" | "jury";
  title: string;
  state: V3JourneyState;
  detail: string;
  route: string;
  actionId: string;
};

export type V3JourneyProjection = {
  editionId: string | null;
  responsibilities: readonly V3JourneyResponsibility[];
  optionalParticipation: readonly V3ActionProjection[];
  stateVersion: string | number | null;
};

export type V3BootstrapInput<TUser = unknown, TMembership = unknown> = {
  user: TUser | null;
  memberships: readonly TMembership[];
  capabilities: readonly string[];
  primaryContext: V3PrimaryContext;
  serverTime: string;
  schemaVersion?: string;
};

export type V3AppBootstrapProjection<TUser = unknown, TMembership = unknown> = {
  user: TUser | null;
  memberships: readonly TMembership[];
  capabilities: readonly string[];
  primaryContext: V3PrimaryContext;
  attentionSummary: {
    badgeCount: number;
    immediateCount: number;
    hasBlockingAction: boolean;
  };
  serverTime: string;
  schemaVersion: string;
};

export type V3ExperienceProjectionBundle = {
  currentContest: V3CurrentContestProjection | null;
  journey: V3JourneyProjection;
  actions: readonly V3ActionProjection[];
  attention: V3AttentionProjection;
};

const JOURNEY_KIND_ORDER = ["confirmation", "entry", "media", "jury"] as const;
const JOURNEY_KIND_SET = new Set<SolarisTaskKind>(JOURNEY_KIND_ORDER);

function journeyStateForTask(state: SolarisTaskState): V3JourneyState {
  if (state === "completed" || state === "finished") return "complete";
  if (state === "problem") return "problem";
  if (state === "needs_attention" || state === "available") return "active";
  return "waiting";
}

function journeyCandidateScore(task: SolarisTask) {
  if (task.state === "problem") return 50;
  if (task.state === "needs_attention") return 40;
  if (task.state === "available") return 35;
  if (task.state === "upcoming") return 30;
  if (task.state === "waiting") return 20;
  if (task.state === "completed") return 10;
  return 5;
}

export function projectV3Journey(
  tasks: readonly SolarisTask[],
  options: {
    editionId?: string | null;
    stateVersion?: string | number | null;
    now?: number;
  } = {},
): V3JourneyProjection {
  const editionId =
    options.editionId ?? tasks.find((task) => task.editionId)?.editionId ?? null;
  const requiredByKind = new Map<SolarisTaskKind, SolarisTask>();

  for (const task of tasks) {
    if (task.importance !== "required" || !JOURNEY_KIND_SET.has(task.kind)) {
      continue;
    }
    const existing = requiredByKind.get(task.kind);
    if (
      !existing ||
      journeyCandidateScore(task) > journeyCandidateScore(existing)
    ) {
      requiredByKind.set(task.kind, task);
    }
  }

  const responsibilities = JOURNEY_KIND_ORDER.flatMap((kind) => {
    const task = requiredByKind.get(kind);
    if (!task) return [];
    return [
      {
        kind,
        title: task.title,
        state: journeyStateForTask(task.state),
        detail: task.description,
        route: task.route,
        actionId: task.id,
      } satisfies V3JourneyResponsibility,
    ];
  });

  return {
    editionId,
    responsibilities,
    optionalParticipation: projectV3Actions(
      tasks.filter((task) => task.importance === "optional"),
      options.now,
    ),
    stateVersion: options.stateVersion ?? null,
  };
}

export function buildV3CurrentContest(
  input: Omit<V3CurrentContestProjection, "experience">,
): V3CurrentContestProjection {
  return {
    ...input,
    experience: projectV3Experience(input.domains),
  };
}

export function buildV3AppBootstrap<TUser = unknown, TMembership = unknown>(
  input: V3BootstrapInput<TUser, TMembership>,
  attention: V3AttentionProjection,
): V3AppBootstrapProjection<TUser, TMembership> {
  return {
    user: input.user,
    memberships: input.memberships,
    capabilities: input.capabilities,
    primaryContext: input.primaryContext,
    attentionSummary: {
      badgeCount: attention.badgeCount,
      immediateCount: attention.immediateCount,
      hasBlockingAction: attention.hasBlockingAction,
    },
    serverTime: input.serverTime,
    schemaVersion: input.schemaVersion ?? V3_SCHEMA_VERSION,
  };
}

export function buildV3ExperienceProjections(input: {
  tasks: readonly SolarisTask[];
  currentContest?: V3CurrentContestProjection | null;
  editionId?: string | null;
  stateVersion?: string | number | null;
  now?: number;
}): V3ExperienceProjectionBundle {
  const actions = projectV3Actions(input.tasks, input.now);
  return {
    currentContest: input.currentContest ?? null,
    journey: projectV3Journey(input.tasks, {
      editionId: input.editionId,
      stateVersion: input.stateVersion,
      now: input.now,
    }),
    actions,
    attention: projectV3Attention(actions),
  };
}

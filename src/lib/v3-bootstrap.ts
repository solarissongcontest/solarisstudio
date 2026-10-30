import type { SolarisTask } from "./participation-os";
import {
  projectV3Experience,
  type V3ContestDomainSnapshot,
} from "./v3-domain-state";
import { projectV3Actions, projectV3Attention } from "./v3-experience";
import { projectV3Home } from "./v3-home";
import { projectV3Journey } from "./v3-journey";
import {
  canonicalizeParticipantTasks,
  projectParticipantTaskReadModel,
} from "./v3-task-engine";

export type V3BootstrapIdentity = {
  userId: string | null;
  displayName: string | null;
};

export type V3BootstrapContext = {
  editionId: string | null;
  editionLabel: string | null;
  delegationId: string | null;
  delegationName: string | null;
};

export type V3BootstrapSource = {
  schemaVersion: 1;
  generatedAt: string;
  serverTime: string;
  identity: V3BootstrapIdentity;
  context: V3BootstrapContext;
  capabilities: readonly string[];
  domain: V3ContestDomainSnapshot;
  tasks: readonly SolarisTask[];
  preferences?: {
    hideResultSpoilers?: boolean;
  };
};

/**
 * The V3 bootstrap is a pure read projection. Canonical participant task truth
 * is normalized exactly once before Home, Journey, Attention and Participate
 * consume it. Those surfaces therefore cannot independently decide that a
 * Confirmation, Entry, Jury, notice or other responsibility is complete.
 */
export function projectV3Bootstrap(source: V3BootstrapSource) {
  const serverNow = Date.parse(source.serverTime);
  if (!Number.isFinite(serverNow)) {
    throw new Error("V3 bootstrap requires a valid serverTime timestamp.");
  }

  const canonicalTasks = canonicalizeParticipantTasks(source.tasks);
  const taskProjection = projectParticipantTaskReadModel(
    canonicalTasks,
    source.serverTime,
  );
  const experience = projectV3Experience(source.domain);
  const actions = projectV3Actions(canonicalTasks, serverNow);
  const attention = projectV3Attention(actions);
  const journey = projectV3Journey(canonicalTasks);
  const home = projectV3Home({
    experience,
    attention,
    hideResultSpoilers: source.preferences?.hideResultSpoilers ?? false,
  });

  return {
    schemaVersion: source.schemaVersion,
    generatedAt: source.generatedAt,
    serverTime: source.serverTime,
    identity: source.identity,
    context: source.context,
    capabilities: [...source.capabilities],
    taskProjection,
    experience,
    actions,
    attention,
    journey,
    home,
  };
}

export type V3BootstrapProjection = ReturnType<typeof projectV3Bootstrap>;

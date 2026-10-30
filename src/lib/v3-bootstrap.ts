import type { SolarisTask } from "./participation-os";
import {
  projectV3Experience,
  type V3ContestDomainSnapshot,
} from "./v3-domain-state";
import { projectV3Actions, projectV3Attention } from "./v3-experience";
import { projectV3Home } from "./v3-home";
import { projectV3Journey } from "./v3-journey";
import type { V3ParticipantTaskProjection } from "./v3-task-engine";

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
  /**
   * Canonical participant tasks. Production server sources must reconcile this
   * list before it reaches this client-shared projector.
   */
  tasks: readonly SolarisTask[];
  /**
   * Server-produced task-read metadata. Transitional pure/unit callers may omit
   * it, but production bootstrap paths always provide it.
   */
  taskProjection?: V3ParticipantTaskProjection | null;
  preferences?: {
    hideResultSpoilers?: boolean;
  };
};

/**
 * Client-safe V3 projection over a server-authorized snapshot.
 *
 * This module intentionally does not reconcile or infer participant task truth.
 * `loadV3BootstrapProjection` owns that server boundary. Home, Journey, Actions,
 * Attention and Participate only render the already-reconciled task set.
 */
export function projectV3Bootstrap(source: V3BootstrapSource) {
  const serverNow = Date.parse(source.serverTime);
  if (!Number.isFinite(serverNow)) {
    throw new Error("V3 bootstrap requires a valid serverTime timestamp.");
  }

  const experience = projectV3Experience(source.domain);
  const actions = projectV3Actions(source.tasks, serverNow);
  const attention = projectV3Attention(actions);
  const journey = projectV3Journey(source.tasks);
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
    taskProjection: source.taskProjection ?? null,
    experience,
    actions,
    attention,
    journey,
    home,
  };
}

export type V3BootstrapProjection = ReturnType<typeof projectV3Bootstrap>;

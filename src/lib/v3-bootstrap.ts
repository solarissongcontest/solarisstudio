import type { SolarisTask } from "./participation-os";
import { projectV3Experience, type V3DomainSnapshot } from "./v3-domain-state";
import { projectV3Actions, projectV3Attention } from "./v3-experience";
import { projectV3Home } from "./v3-home";
import { projectV3Journey } from "./v3-journey";

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
  domain: V3DomainSnapshot;
  tasks: readonly SolarisTask[];
  preferences?: {
    hideResultSpoilers?: boolean;
  };
};

/**
 * The first V3 bootstrap contract is deliberately a pure projection. It does
 * not fetch data and it does not own workflow truth. Existing server-authority
 * supplies domain facts + task evidence, and every visible V3 summary is
 * derived from that same input in one place.
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
    experience,
    actions,
    attention,
    journey,
    home,
  };
}

export type V3BootstrapProjection = ReturnType<typeof projectV3Bootstrap>;

import type { PublicContestState } from "./current-contest-state";
import type { EditionRuntimeState } from "./edition-state";
import type { SolarisTask } from "./participation-os";
import type {
  V3BootstrapIdentity,
  V3BootstrapSource,
} from "./v3-bootstrap";
import type { V3ShowState } from "./v3-domain-state";
import { v3ContestDomainFromPublicState } from "./v3-public-contest-adapter";
import { v3ContestDomainFromRuntime } from "./v3-runtime-state-adapter";

export type V3ExistingDataAdapterInput = {
  publicContest: PublicContestState;
  runtime?: EditionRuntimeState | null;
  show?: V3ShowState | null;
  tasks: readonly SolarisTask[];
  identity: V3BootstrapIdentity;
  delegation?: {
    id: string | null;
    name: string | null;
  } | null;
  capabilities: readonly string[];
  serverTime: string;
  generatedAt?: string;
  hideResultSpoilers?: boolean;
};

/**
 * Migration adapter for the first V3 rollout slices.
 *
 * Callers pass data Solaris already loaded. This function performs no network
 * work and therefore cannot create a second Home/Participate fetch graph. When
 * orthogonal EditionRuntimeState is available it is preferred; otherwise the
 * existing public contest projection is used as an explicitly transitional
 * fallback.
 */
export function v3BootstrapSourceFromExistingData({
  publicContest,
  runtime = null,
  show = null,
  tasks,
  identity,
  delegation = null,
  capabilities,
  serverTime,
  generatedAt = serverTime,
  hideResultSpoilers = false,
}: V3ExistingDataAdapterInput): V3BootstrapSource {
  const edition = publicContest.edition;
  const domain = runtime
    ? v3ContestDomainFromRuntime({ runtime, show })
    : v3ContestDomainFromPublicState(publicContest);

  return {
    schemaVersion: 1,
    generatedAt,
    serverTime,
    identity,
    context: {
      editionId: edition?.id ?? null,
      editionLabel: edition?.name ?? null,
      delegationId: delegation?.id ?? null,
      delegationName: delegation?.name ?? null,
    },
    capabilities,
    domain,
    tasks,
    preferences: {
      hideResultSpoilers,
    },
  };
}

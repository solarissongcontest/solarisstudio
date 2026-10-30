import type { PublicContestState } from './current-contest-state';
import type { EditionRuntimeState } from './edition-state';
import type { SolarisTask } from './participation-os';
import {
  projectV3Bootstrap,
  type V3BootstrapIdentity,
  type V3BootstrapProjection,
} from './v3-bootstrap';
import { v3BootstrapSourceFromExistingData } from './v3-existing-data-adapter';
import type { V3ShowState } from './v3-domain-state';
import {
  canonicalizeParticipantTasks,
  projectParticipantTaskReadModel,
} from './v3-task-engine';

export type V3BootstrapServerRequest = {
  viewerId: string | null;
  editionId: string | null;
  delegationId: string | null;
};

export type V3BootstrapServerSnapshot = {
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
 * The persistence/query boundary for the server bootstrap.
 *
 * Implementations should assemble one authorized snapshot from the existing
 * canonical readers. Home, Participate and other V3 surfaces consume the
 * resulting projection rather than each recreating their own query graph.
 */
export type V3BootstrapServerSource = {
  loadSnapshot(request: V3BootstrapServerRequest): Promise<V3BootstrapServerSnapshot>;
};

function normalizeOptionalId(value: string | null, label: string): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must be null or a non-empty string.`);
  return normalized;
}

export function normalizeV3BootstrapServerRequest(
  request: V3BootstrapServerRequest,
): V3BootstrapServerRequest {
  return {
    viewerId: normalizeOptionalId(request.viewerId, 'viewerId'),
    editionId: normalizeOptionalId(request.editionId, 'editionId'),
    delegationId: normalizeOptionalId(request.delegationId, 'delegationId'),
  };
}

export function v3BootstrapServerRequestKey(request: V3BootstrapServerRequest): string {
  const normalized = normalizeV3BootstrapServerRequest(request);
  return [
    normalized.viewerId ?? 'anonymous',
    normalized.editionId ?? 'current',
    normalized.delegationId ?? 'none',
  ]
    .map((value) => `${value.length}:${value}`)
    .join('|');
}

function assertTimestamp(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new Error(`V3 server bootstrap requires a valid ${label} timestamp.`);
  }
  return normalized;
}

function assertSnapshotScope(
  request: V3BootstrapServerRequest,
  snapshot: V3BootstrapServerSnapshot,
): void {
  if (request.viewerId !== snapshot.identity.userId) {
    throw new Error('V3 server bootstrap viewer identity does not match the authorized snapshot.');
  }

  const snapshotEditionId = snapshot.publicContest.edition?.id ?? null;
  if (request.editionId != null && request.editionId !== snapshotEditionId) {
    throw new Error('V3 server bootstrap edition does not match the requested context.');
  }

  const snapshotDelegationId = snapshot.delegation?.id ?? null;
  if (request.delegationId != null && request.delegationId !== snapshotDelegationId) {
    throw new Error('V3 server bootstrap delegation does not match the requested context.');
  }
}

export async function loadV3BootstrapProjection(
  request: V3BootstrapServerRequest,
  source: V3BootstrapServerSource,
): Promise<V3BootstrapProjection> {
  const normalized = normalizeV3BootstrapServerRequest(request);
  const snapshot = await source.loadSnapshot(normalized);

  assertSnapshotScope(normalized, snapshot);
  const serverTime = assertTimestamp(snapshot.serverTime, 'serverTime');
  const generatedAt = assertTimestamp(snapshot.generatedAt ?? serverTime, 'generatedAt');

  // One canonical participant Task boundary: authorized domain evidence is
  // reconciled once on the server before any client-shared V3 projection runs.
  // Replays/retries are deterministic and cannot create duplicate obligations.
  const tasks = canonicalizeParticipantTasks(snapshot.tasks);
  const taskProjection = projectParticipantTaskReadModel(tasks, serverTime);

  const bootstrapSource = v3BootstrapSourceFromExistingData({
    publicContest: snapshot.publicContest,
    runtime: snapshot.runtime ?? null,
    show: snapshot.show ?? null,
    tasks,
    taskProjection,
    identity: snapshot.identity,
    delegation: snapshot.delegation ?? null,
    capabilities: snapshot.capabilities,
    serverTime,
    generatedAt,
    hideResultSpoilers: snapshot.hideResultSpoilers ?? false,
  });

  return projectV3Bootstrap(bootstrapSource);
}

export type V3BootstrapRequestLoader = {
  load(request: V3BootstrapServerRequest): Promise<V3BootstrapProjection>;
  clear(): void;
};

/**
 * Request-scoped promise coalescing.
 *
 * Create one loader for a server request/render and discard it afterwards.
 * There is intentionally no module-global cache: viewer/capability/task state
 * can change and must be re-read on a later request.
 */
export function createV3BootstrapRequestLoader(
  source: V3BootstrapServerSource,
): V3BootstrapRequestLoader {
  const loads = new Map<string, Promise<V3BootstrapProjection>>();

  return {
    load(request) {
      const normalized = normalizeV3BootstrapServerRequest(request);
      const key = v3BootstrapServerRequestKey(normalized);
      const existing = loads.get(key);
      if (existing) return existing;

      const pending = loadV3BootstrapProjection(normalized, source);
      loads.set(key, pending);
      void pending.catch(() => {
        if (loads.get(key) === pending) loads.delete(key);
      });
      return pending;
    },
    clear() {
      loads.clear();
    },
  };
}

export type V3DraftWorkflow =
  | "confirmation"
  | "entry"
  | "media"
  | "jury"
  | "televote";

export type V3DraftIdentity = {
  userId: string;
  editionId: string;
  workflow: V3DraftWorkflow;
  resourceId: string;
  delegationId?: string | null;
};

export type V3LocalDraft<T> = {
  schemaVersion: 1;
  identity: V3DraftIdentity;
  /**
   * Server revision this device last observed before editing. Null means the
   * draft was created before a server copy existed.
   */
  baseRevision: number | null;
  savedAt: string;
  deviceId: string;
  dirty: boolean;
  payload: T;
};

export type V3ServerDraft<T> = {
  schemaVersion: 1;
  identity: V3DraftIdentity;
  revision: number;
  updatedAt: string;
  payload: T;
};

export type V3SubmissionState =
  | { status: "not-submitted" }
  | {
      status: "submitted";
      receiptId: string;
      submittedAt: string;
      revision?: number | null;
    }
  | { status: "unknown" };

export type V3DraftResolution<T> =
  | { kind: "empty" }
  | { kind: "use-local"; draft: V3LocalDraft<T>; reason: "local-only" }
  | { kind: "use-server"; draft: V3ServerDraft<T>; reason: "server-only" | "local-clean" }
  | {
      kind: "push-local";
      draft: V3LocalDraft<T>;
      expectedServerRevision: number | null;
      reason: "new-local" | "based-on-current-server";
    }
  | {
      kind: "conflict";
      local: V3LocalDraft<T>;
      server: V3ServerDraft<T>;
      reason: "server-advanced" | "server-behind-local-base" | "identity-mismatch";
    }
  | {
      kind: "submitted";
      receiptId: string;
      submittedAt: string;
      /** A local draft must be removed and must never resurrect this workflow. */
      discardLocal: true;
    }
  | {
      kind: "hold";
      reason: "submission-state-unknown" | "server-draft-missing";
      /** Unknown authority must be reconciled with the server before retrying. */
      allowAutomaticRetry: false;
    };

function sameIdentity(a: V3DraftIdentity, b: V3DraftIdentity) {
  return (
    a.userId === b.userId &&
    a.editionId === b.editionId &&
    a.workflow === b.workflow &&
    a.resourceId === b.resourceId &&
    (a.delegationId ?? null) === (b.delegationId ?? null)
  );
}

function validRevision(value: number | null) {
  return value === null || (Number.isInteger(value) && value >= 0);
}

/**
 * Resolve a device draft against server authority without using wall-clock
 * ordering. Device clocks drift; server revisions do not. The resolver is
 * intentionally conservative for official ballots and entries: when both
 * sides changed from different revisions it reports a conflict instead of
 * attempting a field-level merge that could silently alter an official
 * submission.
 */
export function resolveV3DraftContinuity<T>(input: {
  local: V3LocalDraft<T> | null;
  server: V3ServerDraft<T> | null;
  submission: V3SubmissionState;
}): V3DraftResolution<T> {
  const { local, server, submission } = input;

  if (submission.status === "submitted") {
    return {
      kind: "submitted",
      receiptId: submission.receiptId,
      submittedAt: submission.submittedAt,
      discardLocal: true,
    };
  }

  if (submission.status === "unknown") {
    return {
      kind: "hold",
      reason: "submission-state-unknown",
      allowAutomaticRetry: false,
    };
  }

  if (!local && !server) return { kind: "empty" };
  if (!local && server) return { kind: "use-server", draft: server, reason: "server-only" };

  if (local && !validRevision(local.baseRevision)) {
    throw new Error("V3 local draft has an invalid base revision.");
  }
  if (server && (!Number.isInteger(server.revision) || server.revision < 0)) {
    throw new Error("V3 server draft has an invalid revision.");
  }

  if (local && !server) {
    if (!local.dirty) return { kind: "use-local", draft: local, reason: "local-only" };
    if (local.baseRevision !== null) {
      return {
        kind: "hold",
        reason: "server-draft-missing",
        allowAutomaticRetry: false,
      };
    }
    return {
      kind: "push-local",
      draft: local,
      expectedServerRevision: null,
      reason: "new-local",
    };
  }

  const localDraft = local as V3LocalDraft<T>;
  const serverDraft = server as V3ServerDraft<T>;

  if (!sameIdentity(localDraft.identity, serverDraft.identity)) {
    return {
      kind: "conflict",
      local: localDraft,
      server: serverDraft,
      reason: "identity-mismatch",
    };
  }

  if (!localDraft.dirty) {
    return { kind: "use-server", draft: serverDraft, reason: "local-clean" };
  }

  if (localDraft.baseRevision === serverDraft.revision) {
    return {
      kind: "push-local",
      draft: localDraft,
      expectedServerRevision: serverDraft.revision,
      reason: "based-on-current-server",
    };
  }

  if (localDraft.baseRevision === null || localDraft.baseRevision < serverDraft.revision) {
    return {
      kind: "conflict",
      local: localDraft,
      server: serverDraft,
      reason: "server-advanced",
    };
  }

  return {
    kind: "conflict",
    local: localDraft,
    server: serverDraft,
    reason: "server-behind-local-base",
  };
}

export type V3SubmitReconciliation =
  | {
      kind: "confirmed";
      receiptId: string;
      clearDraft: true;
      retry: false;
    }
  | {
      kind: "retry-safe";
      clearDraft: false;
      retry: true;
    }
  | {
      kind: "hold";
      clearDraft: false;
      retry: false;
      reason: "server-state-unknown";
    };

/**
 * After an interrupted submit, never infer failure from the client error. A
 * timeout can happen after the server committed. Re-read server authority and
 * retry only when the server positively says no submission exists.
 */
export function reconcileV3SubmitAttempt(
  submission: V3SubmissionState,
): V3SubmitReconciliation {
  if (submission.status === "submitted") {
    return {
      kind: "confirmed",
      receiptId: submission.receiptId,
      clearDraft: true,
      retry: false,
    };
  }

  if (submission.status === "not-submitted") {
    return {
      kind: "retry-safe",
      clearDraft: false,
      retry: true,
    };
  }

  return {
    kind: "hold",
    clearDraft: false,
    retry: false,
    reason: "server-state-unknown",
  };
}

/** Stable scope key for device caches and server draft records. */
export function v3DraftScopeKey(identity: V3DraftIdentity) {
  const delegation = identity.delegationId ?? "none";
  return [
    "v3-draft",
    identity.userId,
    identity.editionId,
    delegation,
    identity.workflow,
    identity.resourceId,
  ]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

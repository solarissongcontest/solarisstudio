import { describe, expect, it } from "vitest";

import {
  reconcileV3SubmitAttempt,
  resolveV3DraftContinuity,
  v3DraftScopeKey,
  type V3DraftIdentity,
  type V3LocalDraft,
  type V3ServerDraft,
} from "./v3-draft-continuity";

const identity: V3DraftIdentity = {
  userId: "user-1",
  editionId: "edition-22",
  delegationId: "oland",
  workflow: "jury",
  resourceId: "semi-1",
};

function local<T>(
  payload: T,
  options: Partial<Pick<V3LocalDraft<T>, "baseRevision" | "dirty" | "identity">> = {},
): V3LocalDraft<T> {
  return {
    schemaVersion: 1,
    identity: options.identity ?? identity,
    baseRevision: options.baseRevision ?? 4,
    savedAt: "2026-10-11T19:00:00.000Z",
    deviceId: "iphone",
    dirty: options.dirty ?? true,
    payload,
  };
}

function server<T>(
  payload: T,
  options: Partial<Pick<V3ServerDraft<T>, "revision" | "identity">> = {},
): V3ServerDraft<T> {
  return {
    schemaVersion: 1,
    identity: options.identity ?? identity,
    revision: options.revision ?? 4,
    updatedAt: "2026-10-11T18:58:00.000Z",
    payload,
  };
}

describe("resolveV3DraftContinuity", () => {
  it("allows a dirty device draft to update exactly the server revision it was based on", () => {
    const result = resolveV3DraftContinuity({
      local: local({ ranking: ["a", "b"] }),
      server: server({ ranking: ["a"] }),
      submission: { status: "not-submitted" },
    });

    expect(result).toMatchObject({
      kind: "push-local",
      expectedServerRevision: 4,
      reason: "based-on-current-server",
    });
  });

  it("does not silently overwrite another device when the server advanced", () => {
    const result = resolveV3DraftContinuity({
      local: local({ ranking: ["a", "b"] }, { baseRevision: 4 }),
      server: server({ ranking: ["c", "d"] }, { revision: 5 }),
      submission: { status: "not-submitted" },
    });

    expect(result).toMatchObject({
      kind: "conflict",
      reason: "server-advanced",
    });
  });

  it("uses the server copy when the local cache has no unsynced edits", () => {
    const result = resolveV3DraftContinuity({
      local: local({ ranking: ["old"] }, { baseRevision: 3, dirty: false }),
      server: server({ ranking: ["new"] }, { revision: 7 }),
      submission: { status: "not-submitted" },
    });

    expect(result).toMatchObject({
      kind: "use-server",
      reason: "local-clean",
      draft: { revision: 7 },
    });
  });

  it("treats a first-device draft as a create with a null expected revision", () => {
    const result = resolveV3DraftContinuity({
      local: local({ ranking: ["a"] }, { baseRevision: null }),
      server: null,
      submission: { status: "not-submitted" },
    });

    expect(result).toMatchObject({
      kind: "push-local",
      expectedServerRevision: null,
      reason: "new-local",
    });
  });

  it("never resurrects a draft after the server confirms submission", () => {
    const result = resolveV3DraftContinuity({
      local: local({ ranking: ["a", "b"] }),
      server: server({ ranking: ["a"] }),
      submission: {
        status: "submitted",
        receiptId: "receipt-123",
        submittedAt: "2026-10-11T19:04:00.000Z",
      },
    });

    expect(result).toEqual({
      kind: "submitted",
      receiptId: "receipt-123",
      submittedAt: "2026-10-11T19:04:00.000Z",
      discardLocal: true,
    });
  });

  it("holds when submit state is uncertain instead of guessing from the client", () => {
    const result = resolveV3DraftContinuity({
      local: local({ ranking: ["a", "b"] }),
      server: server({ ranking: ["a"] }),
      submission: { status: "unknown" },
    });

    expect(result).toEqual({
      kind: "hold",
      reason: "submission-state-unknown",
      allowAutomaticRetry: false,
    });
  });

  it("refuses to reconcile drafts that belong to different workflow identities", () => {
    const result = resolveV3DraftContinuity({
      local: local({ ranking: ["a"] }),
      server: server(
        { ranking: ["b"] },
        {
          identity: {
            ...identity,
            resourceId: "grand-final",
          },
        },
      ),
      submission: { status: "not-submitted" },
    });

    expect(result).toMatchObject({ kind: "conflict", reason: "identity-mismatch" });
  });

  it("does not use savedAt timestamps as conflict authority", () => {
    const result = resolveV3DraftContinuity({
      local: {
        ...local({ ranking: ["phone"] }, { baseRevision: 2 }),
        savedAt: "2099-01-01T00:00:00.000Z",
      },
      server: {
        ...server({ ranking: ["desktop"] }, { revision: 3 }),
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      submission: { status: "not-submitted" },
    });

    expect(result).toMatchObject({ kind: "conflict", reason: "server-advanced" });
  });
});

describe("reconcileV3SubmitAttempt", () => {
  it("clears the draft when the server returns an authoritative receipt", () => {
    expect(
      reconcileV3SubmitAttempt({
        status: "submitted",
        receiptId: "receipt-123",
        submittedAt: "2026-10-11T19:04:00.000Z",
      }),
    ).toEqual({
      kind: "confirmed",
      receiptId: "receipt-123",
      clearDraft: true,
      retry: false,
    });
  });

  it("retries only after the server explicitly confirms nothing was submitted", () => {
    expect(reconcileV3SubmitAttempt({ status: "not-submitted" })).toEqual({
      kind: "retry-safe",
      clearDraft: false,
      retry: true,
    });
  });

  it("never auto-retries an uncertain official submission", () => {
    expect(reconcileV3SubmitAttempt({ status: "unknown" })).toEqual({
      kind: "hold",
      clearDraft: false,
      retry: false,
      reason: "server-state-unknown",
    });
  });
});

describe("v3DraftScopeKey", () => {
  it("is stable and identity-scoped across user, edition, delegation, workflow and resource", () => {
    expect(v3DraftScopeKey(identity)).toBe(
      "v3-draft:user-1:edition-22:oland:jury:semi-1",
    );

    expect(v3DraftScopeKey({ ...identity, resourceId: "grand final" })).toBe(
      "v3-draft:user-1:edition-22:oland:jury:grand%20final",
    );
  });
});

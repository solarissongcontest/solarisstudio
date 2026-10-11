import { describe, expect, it } from "vitest";

import {
  applyV3DraftSave,
  buildV3DraftSaveCommand,
  createV3VersionedDraft,
  editV3DraftLocally,
  reconcileV3Draft,
} from "./v3-draft-revision";

type BallotDraft = {
  ranking: string[];
};

const SERVER_TIME = "2026-10-11T19:30:00.000Z";

function serverDraft(
  revision: number,
  ranking: string[],
  deviceId = "phone",
) {
  return createV3VersionedDraft<BallotDraft>({
    draftId: "jury:ssc22:sf1:oland",
    revision,
    value: { ranking },
    updatedAt: `2026-10-11T19:${String(revision).padStart(2, "0")}:00.000Z`,
    deviceId,
    sessionId: `${deviceId}-session`,
  });
}

describe("Solaris Studio V3 draft revision protocol", () => {
  it("refuses a stale desktop save after the phone has advanced the server draft", () => {
    const phoneRevision18 = serverDraft(18, ["A", "B", "C"], "phone");
    const desktopRevision17 = serverDraft(17, ["A", "C", "B"], "desktop");
    const desktopEdited = editV3DraftLocally(desktopRevision17, {
      value: { ranking: ["C", "A", "B"] },
      updatedAt: "2026-10-11T19:29:00.000Z",
      deviceId: "desktop",
      sessionId: "desktop-session",
    });

    const result = applyV3DraftSave(
      phoneRevision18,
      buildV3DraftSaveCommand(desktopEdited, "op-desktop-save"),
      SERVER_TIME,
    );

    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") return;
    expect(result.reason).toBe("stale_revision");
    expect(result.attemptedBaseRevision).toBe(17);
    expect(result.serverDraft.serverRevision).toBe(18);
    expect(result.serverDraft.value.ranking).toEqual(["A", "B", "C"]);
  });

  it("accepts an exact-base save and advances the authoritative revision exactly once", () => {
    const revision18 = serverDraft(18, ["A", "B", "C"]);
    const locallyEdited = editV3DraftLocally(revision18, {
      value: { ranking: ["B", "A", "C"] },
      updatedAt: "2099-01-01T00:00:00.000Z",
      deviceId: "desktop",
      sessionId: "desktop-session",
    });
    const command = buildV3DraftSaveCommand(locallyEdited, "op-19");

    const result = applyV3DraftSave(revision18, command, SERVER_TIME);

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") return;
    expect(result.previousRevision).toBe(18);
    expect(result.draft.revision).toBe(19);
    expect(result.draft.serverRevision).toBe(19);
    expect(result.draft.value.ranking).toEqual(["B", "A", "C"]);
    expect(result.draft.deviceId).toBe("desktop");
    expect(result.draft.sessionId).toBe("desktop-session");
    expect(result.draft.lastOperationId).toBe("op-19");
    expect(result.draft.updatedAt).toBe(SERVER_TIME);
    expect(result.draft.updatedAt).not.toBe(command.clientUpdatedAt);
  });

  it("refuses a future revision instead of trusting a client that claims unseen server history", () => {
    const revision18 = serverDraft(18, ["A", "B"]);
    const command = {
      ...buildV3DraftSaveCommand(
        editV3DraftLocally(revision18, {
          value: { ranking: ["B", "A"] },
          updatedAt: "2026-10-11T19:29:00.000Z",
        }),
        "op-future",
      ),
      baseRevision: 20,
      clientRevision: 21,
    };

    const result = applyV3DraftSave(revision18, command, SERVER_TIME);

    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") return;
    expect(result.reason).toBe("future_revision");
    expect(result.serverDraft.serverRevision).toBe(18);
  });

  it("refuses a save aimed at a different draft identity", () => {
    const revision18 = serverDraft(18, ["A", "B"]);
    const edited = editV3DraftLocally(revision18, {
      value: { ranking: ["B", "A"] },
      updatedAt: "2026-10-11T19:29:00.000Z",
    });
    const command = {
      ...buildV3DraftSaveCommand(edited, "op-wrong-draft"),
      draftId: "jury:ssc22:final:oland",
    };

    const result = applyV3DraftSave(revision18, command, SERVER_TIME);

    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") return;
    expect(result.reason).toBe("draft_mismatch");
  });

  it("rejects a save command that contains no local revision advance", () => {
    const revision18 = serverDraft(18, ["A", "B"]);
    const command = buildV3DraftSaveCommand(revision18, "op-no-change");

    expect(() => applyV3DraftSave(revision18, command, SERVER_TIME)).toThrow(
      /clientRevision must be greater than baseRevision/,
    );
  });

  it("never calls an offline local edit server-saved", () => {
    const revision18 = serverDraft(18, ["A", "B"]);
    const offlineEdit = editV3DraftLocally(revision18, {
      value: { ranking: ["B", "A"] },
      updatedAt: "2026-10-11T19:31:00.000Z",
      deviceId: "phone",
    });

    expect(offlineEdit.revision).toBe(19);
    expect(offlineEdit.serverRevision).toBe(18);

    const reconciliation = reconcileV3Draft(offlineEdit, revision18, false);
    expect(reconciliation.state).toBe("offline_local");
    expect(reconciliation.reason).toContain("no server acknowledgement");
  });

  it("reports an explicit conflict when both the local device and server changed", () => {
    const knownRevision17 = serverDraft(17, ["A", "B", "C"], "desktop");
    const localEdit = editV3DraftLocally(knownRevision17, {
      value: { ranking: ["B", "A", "C"] },
      updatedAt: "2026-10-11T19:28:00.000Z",
      deviceId: "desktop",
    });
    const phoneRevision18 = serverDraft(18, ["C", "A", "B"], "phone");

    const reconciliation = reconcileV3Draft(localEdit, phoneRevision18, true);

    expect(reconciliation.state).toBe("conflict");
    expect(reconciliation.reason).toContain("changed on the server");
    expect(reconciliation.serverDraft?.serverRevision).toBe(18);
  });

  it("reports server-ahead when the local device has no unsaved edits", () => {
    const localRevision17 = serverDraft(17, ["A", "B"], "desktop");
    const serverRevision18 = serverDraft(18, ["B", "A"], "phone");

    const reconciliation = reconcileV3Draft(
      localRevision17,
      serverRevision18,
      true,
    );

    expect(reconciliation.state).toBe("server_ahead");
  });

  it("treats a duplicate save command as stale rather than inventing unverifiable idempotency", () => {
    const revision18 = serverDraft(18, ["A", "B"]);
    const localEdit = editV3DraftLocally(revision18, {
      value: { ranking: ["B", "A"] },
      updatedAt: "2026-10-11T19:29:00.000Z",
    });
    const command = buildV3DraftSaveCommand(localEdit, "op-once");
    const first = applyV3DraftSave(revision18, command, SERVER_TIME);

    expect(first.status).toBe("accepted");
    if (first.status !== "accepted") return;

    const retry = applyV3DraftSave(
      first.draft,
      command,
      "2026-10-11T19:31:00.000Z",
    );
    expect(retry.status).toBe("conflict");
    if (retry.status !== "conflict") return;
    expect(retry.reason).toBe("stale_revision");
    expect(retry.serverDraft.serverRevision).toBe(19);
  });

  it("rejects a non-authoritative object passed as the server draft", () => {
    const revision18 = serverDraft(18, ["A", "B"]);
    const localOnly = editV3DraftLocally(revision18, {
      value: { ranking: ["B", "A"] },
      updatedAt: "2026-10-11T19:29:00.000Z",
    });

    expect(() =>
      applyV3DraftSave(
        localOnly,
        buildV3DraftSaveCommand(localOnly, "op-invalid-server"),
        SERVER_TIME,
      ),
    ).toThrow(/authoritative/);
  });

  it("rejects impossible local revision knowledge where revision trails serverRevision", () => {
    const impossible = {
      ...serverDraft(18, ["A", "B"]),
      revision: 17,
    };

    expect(() =>
      editV3DraftLocally(impossible, {
        value: { ranking: ["B", "A"] },
        updatedAt: "2026-10-11T19:29:00.000Z",
      }),
    ).toThrow(/cannot be behind/);
  });

  it("does not mutate the server object while evaluating accepted or conflicting saves", () => {
    const revision18 = serverDraft(18, ["A", "B"]);
    const snapshot = JSON.stringify(revision18);
    const localEdit = editV3DraftLocally(revision18, {
      value: { ranking: ["B", "A"] },
      updatedAt: "2026-10-11T19:29:00.000Z",
    });

    applyV3DraftSave(
      revision18,
      buildV3DraftSaveCommand(localEdit, "op-immutable"),
      SERVER_TIME,
    );

    expect(JSON.stringify(revision18)).toBe(snapshot);
  });
});

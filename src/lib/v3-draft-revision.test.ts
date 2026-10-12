import { describe, expect, it } from "vitest";

import {
  decideV3DraftWrite,
  v3DraftConflictUserMessage,
  type V3DraftRevision,
} from "./v3-draft-revision";

const current = (overrides: Partial<V3DraftRevision> = {}): V3DraftRevision => ({
  draftId: "jury:ssc22-sf1:oland",
  revision: 8,
  updatedAt: "2026-10-11T19:10:00.000Z",
  writerId: "iphone-session",
  ...overrides,
});

describe("V3 draft optimistic concurrency", () => {
  it("creates revision 1 for a new draft", () => {
    expect(
      decideV3DraftWrite(null, {
        draftId: "jury:ssc22-sf1:oland",
        baseRevision: null,
        writerId: "iphone-session",
        at: "2026-10-11T19:00:00.000Z",
      }),
    ).toEqual({
      status: "accept",
      next: {
        draftId: "jury:ssc22-sf1:oland",
        revision: 1,
        updatedAt: "2026-10-11T19:00:00.000Z",
        writerId: "iphone-session",
      },
    });
  });

  it("accepts a write whose base revision matches canonical state", () => {
    expect(
      decideV3DraftWrite(current(), {
        draftId: "jury:ssc22-sf1:oland",
        baseRevision: 8,
        writerId: "desktop-session",
        at: "2026-10-11T19:12:00.000Z",
      }),
    ).toEqual({
      status: "accept",
      next: {
        draftId: "jury:ssc22-sf1:oland",
        revision: 9,
        updatedAt: "2026-10-11T19:12:00.000Z",
        writerId: "desktop-session",
      },
    });
  });

  it("blocks a stale desktop write after the phone advanced the draft", () => {
    const decision = decideV3DraftWrite(current({ revision: 9, writerId: "iphone-session" }), {
      draftId: "jury:ssc22-sf1:oland",
      baseRevision: 8,
      writerId: "desktop-session",
      at: "2026-10-11T19:13:00.000Z",
    });

    expect(decision).toMatchObject({
      status: "conflict",
      attemptedBaseRevision: 8,
      changedOnAnotherWriter: true,
      current: {
        revision: 9,
        writerId: "iphone-session",
      },
    });
    expect(v3DraftConflictUserMessage(decision)).toBe(
      "This draft was changed on another device.",
    );
  });

  it("distinguishes same-session staleness from another-device conflicts", () => {
    const decision = decideV3DraftWrite(current({ revision: 9 }), {
      draftId: "jury:ssc22-sf1:oland",
      baseRevision: 8,
      writerId: "iphone-session",
      at: "2026-10-11T19:13:00.000Z",
    });

    expect(decision).toMatchObject({
      status: "conflict",
      changedOnAnotherWriter: false,
    });
    expect(v3DraftConflictUserMessage(decision)).toBe(
      "A newer version of this draft exists.",
    );
  });

  it("rejects writes aimed at a different canonical draft identity", () => {
    expect(
      decideV3DraftWrite(current(), {
        draftId: "jury:ssc22-final:oland",
        baseRevision: 8,
        writerId: "desktop-session",
        at: "2026-10-11T19:12:00.000Z",
      }),
    ).toEqual({
      status: "invalid",
      message: "Draft identity does not match the canonical draft.",
    });
  });

  it("rejects malformed revision metadata", () => {
    expect(
      decideV3DraftWrite(current(), {
        draftId: "jury:ssc22-sf1:oland",
        baseRevision: -1,
        writerId: "desktop-session",
        at: "2026-10-11T19:12:00.000Z",
      }),
    ).toEqual({
      status: "invalid",
      message: "Draft write metadata is invalid.",
    });
  });
});

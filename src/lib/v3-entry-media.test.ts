import { describe, expect, it } from "vitest";

import {
  V3_ENTRY_MEDIA_PIPELINE_STATES,
  actualUploadProgressPercent,
  projectV3EntryMediaPipeline,
  type V3EntryMediaServerProjection,
} from "./v3-entry-media";
import {
  applyV3MediaFinalizeOutcome,
  applyV3QuarantineUploadOutcome,
  beginV3MediaFinalization,
  beginV3QuarantineUpload,
  createV3MediaUploadContinuity,
} from "./v3-media-upload-continuity";

function prepared() {
  return createV3MediaUploadContinuity({
    tokenId: "token-1",
    quarantineBucket: "solaris-upload-quarantine",
    quarantinePath: "token-1/file.bin",
    finalBucket: "entry-media",
  });
}

function server(
  state: V3EntryMediaServerProjection["state"],
  reason: string | null = null,
): V3EntryMediaServerProjection {
  return {
    assetKey: "entry:entry-1:artist_photo",
    assetType: "artist_photo",
    state,
    reason,
    updatedAt: "2026-10-17T10:00:00.000Z",
  };
}

describe("Public V3 P14 Entry media pipeline", () => {
  it("keeps the canonical P14 state vocabulary explicit", () => {
    expect(V3_ENTRY_MEDIA_PIPELINE_STATES).toEqual([
      "queued",
      "uploading",
      "processing",
      "validating",
      "accepted",
      "failed",
      "quarantined",
      "replacement_required",
    ]);
  });

  it("reports only actual measured upload progress", () => {
    expect(actualUploadProgressPercent(0, 100)).toBe(0);
    expect(actualUploadProgressPercent(25, 100)).toBe(25);
    expect(actualUploadProgressPercent(1, 3)).toBe(33.3);
    expect(actualUploadProgressPercent(101, 100)).toBeNull();
    expect(actualUploadProgressPercent(1, 0)).toBeNull();
    expect(actualUploadProgressPercent(Number.NaN, 100)).toBeNull();
  });

  it("separates queued, uploading and post-transmission processing", () => {
    const queued = projectV3EntryMediaPipeline({ upload: prepared() });
    expect(queued?.state).toBe("queued");
    expect(queued?.progressPercent).toBeNull();

    const uploading = beginV3QuarantineUpload(prepared());
    expect(
      projectV3EntryMediaPipeline({ upload: uploading, measuredProgressPercent: 42.4 }),
    ).toMatchObject({ state: "uploading", progressPercent: 42.4, terminal: false });

    const uploaded = applyV3QuarantineUploadOutcome(uploading, { kind: "uploaded" });
    expect(projectV3EntryMediaPipeline({ upload: uploaded })).toMatchObject({
      state: "processing",
      progressPercent: null,
      terminal: false,
    });
  });

  it("never treats verified bytes as accepted Entry media", () => {
    const uploading = beginV3QuarantineUpload(prepared());
    const uploaded = applyV3QuarantineUploadOutcome(uploading, { kind: "uploaded" });
    const finalizing = beginV3MediaFinalization(uploaded);
    const verified = applyV3MediaFinalizeOutcome(finalizing, {
      kind: "verified",
      receipt: {
        tokenId: "token-1",
        bucket: "entry-media",
        objectPath: "entry-1/artist.webp",
        detectedMime: "image/webp",
        metadata: {},
        replayed: false,
      },
    });

    expect(projectV3EntryMediaPipeline({ upload: verified })).toMatchObject({
      state: "validating",
      source: "local-upload",
      terminal: false,
    });
    expect(projectV3EntryMediaPipeline({ upload: verified })?.state).not.toBe("accepted");
  });

  it("lets caller-scoped server evidence establish accepted and replacement states", () => {
    expect(projectV3EntryMediaPipeline({ server: server("accepted") })).toMatchObject({
      state: "accepted",
      source: "server",
      terminal: true,
      retryable: false,
    });

    expect(
      projectV3EntryMediaPipeline({
        server: server("replacement_required", "Artist image is below the required resolution."),
      }),
    ).toMatchObject({
      state: "replacement_required",
      source: "server",
      terminal: true,
      retryable: true,
      detail: "Artist image is below the required resolution.",
    });
  });

  it("prefers authoritative server evidence over local transport continuity", () => {
    const uploading = beginV3QuarantineUpload(prepared());
    const view = projectV3EntryMediaPipeline({
      upload: uploading,
      measuredProgressPercent: 70,
      server: server("quarantined", "File requires manual review."),
    });

    expect(view).toMatchObject({
      state: "quarantined",
      source: "server",
      progressPercent: null,
      terminal: true,
    });
  });

  it("keeps ambiguous transport recoverable without minting a success state", () => {
    const uploading = beginV3QuarantineUpload(prepared());
    const uncertain = applyV3QuarantineUploadOutcome(uploading, { kind: "transport_ambiguous" });
    expect(projectV3EntryMediaPipeline({ upload: uncertain })).toMatchObject({
      state: "processing",
      terminal: false,
    });

    const finalizing = beginV3MediaFinalization(uncertain);
    const retry = applyV3MediaFinalizeOutcome(finalizing, { kind: "quarantine_missing" });
    expect(projectV3EntryMediaPipeline({ upload: retry })).toMatchObject({
      state: "failed",
      retryable: true,
      terminal: false,
    });
  });

  it("returns no state when there is no server or local evidence", () => {
    expect(projectV3EntryMediaPipeline({})).toBeNull();
  });
});

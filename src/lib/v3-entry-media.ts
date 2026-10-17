import type { V3MediaUploadContinuity } from "./v3-media-upload-continuity";

export const V3_ENTRY_MEDIA_PIPELINE_STATES = [
  "queued",
  "uploading",
  "processing",
  "validating",
  "accepted",
  "failed",
  "quarantined",
  "replacement_required",
] as const;

export type V3EntryMediaPipelineState = (typeof V3_ENTRY_MEDIA_PIPELINE_STATES)[number];

/**
 * Participant-safe server projection. This is deliberately narrower than the
 * Organizer review model: it contains only the state and reason the submitting
 * delegation is allowed to see.
 *
 * P14 must not populate this shape from `studio2_media_asset_reviews` in the
 * browser. That RPC is Organizer-owned. A System-owned caller-scoped projection
 * is required before the terminal review states can be wired into the UI.
 */
export type V3EntryMediaServerProjection = {
  assetKey: string;
  assetType: string;
  state:
    | "processing"
    | "validating"
    | "accepted"
    | "failed"
    | "quarantined"
    | "replacement_required";
  reason: string | null;
  updatedAt: string;
};

export type V3EntryMediaPipelineView = {
  state: V3EntryMediaPipelineState;
  source: "local-upload" | "server";
  detail: string;
  retryable: boolean;
  terminal: boolean;
  /**
   * Actual measured transfer progress only. `null` means the transport did not
   * expose trustworthy byte progress and the UI must not invent a percentage.
   */
  progressPercent: number | null;
};

export function actualUploadProgressPercent(loadedBytes: number, totalBytes: number): number | null {
  if (!Number.isFinite(loadedBytes) || !Number.isFinite(totalBytes)) return null;
  if (totalBytes <= 0 || loadedBytes < 0 || loadedBytes > totalBytes) return null;
  return Math.round((loadedBytes / totalBytes) * 1000) / 10;
}

function projectServerState(server: V3EntryMediaServerProjection): V3EntryMediaPipelineView {
  const detail = server.reason?.trim() || (() => {
    switch (server.state) {
      case "processing":
        return "Upload received. Solaris is processing the media.";
      case "validating":
        return "Solaris is validating the current media source.";
      case "accepted":
        return "The current media source is accepted.";
      case "failed":
        return "Solaris could not process the current media source.";
      case "quarantined":
        return "The media is quarantined and cannot be used yet.";
      case "replacement_required":
        return "The current media source must be replaced before resubmission.";
    }
  })();

  return {
    state: server.state,
    source: "server",
    detail,
    retryable: server.state === "failed" || server.state === "replacement_required",
    terminal: server.state === "accepted" || server.state === "quarantined" || server.state === "replacement_required",
    progressPercent: null,
  };
}

function projectLocalUpload(
  upload: V3MediaUploadContinuity,
  progressPercent: number | null,
): V3EntryMediaPipelineView {
  switch (upload.state) {
    case "prepared":
      return {
        state: "queued",
        source: "local-upload",
        detail: "Upload authorized and queued on this device.",
        retryable: false,
        terminal: false,
        progressPercent: null,
      };
    case "uploading":
      return {
        state: "uploading",
        source: "local-upload",
        detail: progressPercent === null ? "Uploading media…" : `Uploading media… ${progressPercent}%`,
        retryable: false,
        terminal: false,
        progressPercent,
      };
    case "ready_to_finalize":
    case "quarantine_uncertain":
    case "finalizing":
    case "finalize_uncertain":
      return {
        state: "processing",
        source: "local-upload",
        detail: "Upload transmission is complete. Solaris is reconciling and processing the media.",
        retryable: false,
        terminal: false,
        progressPercent: null,
      };
    case "verified":
      return {
        state: "validating",
        source: "local-upload",
        detail: "Upload verified. Waiting for authoritative media validation and review status.",
        retryable: false,
        terminal: false,
        progressPercent: null,
      };
    case "retry_upload":
      return {
        state: "failed",
        source: "local-upload",
        detail: "The upload could not be confirmed. Retry the same authorized upload.",
        retryable: true,
        terminal: false,
        progressPercent: null,
      };
    case "rejected":
      return {
        state: "failed",
        source: "local-upload",
        detail: upload.failureReason?.trim() || "Solaris rejected the upload.",
        retryable: false,
        terminal: true,
        progressPercent: null,
      };
    case "expired":
      return {
        state: "failed",
        source: "local-upload",
        detail: "The upload authorization expired. Start a new authorized upload.",
        retryable: true,
        terminal: true,
        progressPercent: null,
      };
  }
}

/**
 * Server evidence wins whenever it exists. Local continuity only describes the
 * transport/finalizer phase on this mounted client and can never establish
 * Organizer review acceptance.
 */
export function projectV3EntryMediaPipeline(input: {
  upload?: V3MediaUploadContinuity | null;
  server?: V3EntryMediaServerProjection | null;
  measuredProgressPercent?: number | null;
}): V3EntryMediaPipelineView | null {
  if (input.server) return projectServerState(input.server);
  if (!input.upload) return null;

  const progress =
    typeof input.measuredProgressPercent === "number" &&
    Number.isFinite(input.measuredProgressPercent) &&
    input.measuredProgressPercent >= 0 &&
    input.measuredProgressPercent <= 100
      ? Math.round(input.measuredProgressPercent * 10) / 10
      : null;

  return projectLocalUpload(input.upload, progress);
}

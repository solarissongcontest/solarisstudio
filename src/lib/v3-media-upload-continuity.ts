export type V3MediaUploadState =
  | "prepared"
  | "uploading"
  | "quarantine_uncertain"
  | "ready_to_finalize"
  | "finalizing"
  | "finalize_uncertain"
  | "retry_upload"
  | "verified"
  | "rejected"
  | "expired";

export type V3MediaUploadAuthorization = {
  tokenId: string;
  quarantineBucket: string;
  quarantinePath: string;
  finalBucket: string;
};

export type V3VerifiedMediaReceipt = {
  tokenId: string;
  bucket: string;
  objectPath: string;
  detectedMime: string;
  metadata: Record<string, unknown>;
  replayed: boolean;
};

export type V3MediaUploadContinuity = {
  authorization: V3MediaUploadAuthorization;
  state: V3MediaUploadState;
  quarantineAttempts: number;
  finalizeAttempts: number;
  verifiedReceipt: V3VerifiedMediaReceipt | null;
  failureReason: string | null;
};

export type V3QuarantineUploadOutcome =
  | { kind: "uploaded" }
  | { kind: "transport_ambiguous" }
  | { kind: "asset_already_exists" }
  | { kind: "explicit_failure"; reason: string; retryable: boolean };

export type V3MediaFinalizeOutcome =
  | { kind: "verified"; receipt: V3VerifiedMediaReceipt }
  | { kind: "transport_ambiguous" }
  | { kind: "quarantine_missing" }
  | { kind: "authorization_expired"; reason?: string }
  | { kind: "authorization_rejected"; reason: string };

export type V3MediaRecoveryAction =
  | "none"
  | "upload_same_authorization"
  | "finalize_same_authorization"
  | "retry_finalize_same_authorization";

function required(value: string, label: string) {
  if (!value.trim()) throw new Error(`${label} must not be empty`);
  return value;
}

function safeIncrement(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  if (value === Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label} cannot advance beyond Number.MAX_SAFE_INTEGER`);
  }
  return value + 1;
}

function validateAuthorization(authorization: V3MediaUploadAuthorization) {
  required(authorization.tokenId, "authorization.tokenId");
  required(authorization.quarantineBucket, "authorization.quarantineBucket");
  required(authorization.quarantinePath, "authorization.quarantinePath");
  required(authorization.finalBucket, "authorization.finalBucket");

  if (authorization.quarantineBucket !== "solaris-upload-quarantine") {
    throw new Error("media upload must use the Solaris quarantine bucket");
  }
  if (
    authorization.quarantinePath.startsWith("/") ||
    authorization.quarantinePath.split("/").includes("..")
  ) {
    throw new Error("authorization.quarantinePath is unsafe");
  }
}

export function createV3MediaUploadContinuity(
  authorization: V3MediaUploadAuthorization,
): V3MediaUploadContinuity {
  validateAuthorization(authorization);
  return {
    authorization: { ...authorization },
    state: "prepared",
    quarantineAttempts: 0,
    finalizeAttempts: 0,
    verifiedReceipt: null,
    failureReason: null,
  };
}

export function beginV3QuarantineUpload(upload: V3MediaUploadContinuity): V3MediaUploadContinuity {
  if (upload.state !== "prepared" && upload.state !== "retry_upload") {
    throw new Error(`cannot upload quarantine object from state ${upload.state}`);
  }

  return {
    ...upload,
    state: "uploading",
    quarantineAttempts: safeIncrement(upload.quarantineAttempts, "quarantineAttempts"),
    failureReason: null,
  };
}

/**
 * `asset_already_exists` is intentionally ambiguous rather than failed.
 * With upsert disabled, a repeated upload to the same server-generated path can
 * report that the object already exists because the previous request actually
 * succeeded and its response was lost. V3 must keep the same authorization and
 * ask the verifier/finalizer what exists instead of minting another object.
 */
export function applyV3QuarantineUploadOutcome(
  upload: V3MediaUploadContinuity,
  outcome: V3QuarantineUploadOutcome,
): V3MediaUploadContinuity {
  if (upload.state !== "uploading") {
    throw new Error(`cannot apply quarantine outcome from state ${upload.state}`);
  }

  if (outcome.kind === "uploaded") {
    return {
      ...upload,
      state: "ready_to_finalize",
      failureReason: null,
    };
  }

  if (outcome.kind === "transport_ambiguous" || outcome.kind === "asset_already_exists") {
    return {
      ...upload,
      state: "quarantine_uncertain",
      failureReason: null,
    };
  }

  required(outcome.reason, "outcome.reason");
  return {
    ...upload,
    state: outcome.retryable ? "retry_upload" : "rejected",
    failureReason: outcome.reason,
  };
}

/**
 * Finalization is permitted after a known upload OR an ambiguous upload. In the
 * ambiguous case, the existing Solaris finalizer becomes the reconciliation
 * read: if bytes reached quarantine it verifies them; if they did not, it
 * returns `quarantine_missing` while leaving the same authorization reusable.
 */
export function beginV3MediaFinalization(upload: V3MediaUploadContinuity): V3MediaUploadContinuity {
  if (
    upload.state !== "ready_to_finalize" &&
    upload.state !== "quarantine_uncertain" &&
    upload.state !== "finalize_uncertain"
  ) {
    throw new Error(`cannot finalize media from state ${upload.state}`);
  }

  return {
    ...upload,
    state: "finalizing",
    finalizeAttempts: safeIncrement(upload.finalizeAttempts, "finalizeAttempts"),
    failureReason: null,
  };
}

function validateVerifiedReceipt(
  authorization: V3MediaUploadAuthorization,
  receipt: V3VerifiedMediaReceipt,
) {
  required(receipt.tokenId, "receipt.tokenId");
  required(receipt.bucket, "receipt.bucket");
  required(receipt.objectPath, "receipt.objectPath");
  required(receipt.detectedMime, "receipt.detectedMime");

  if (receipt.tokenId !== authorization.tokenId) {
    throw new Error("verified media receipt belongs to another upload authorization");
  }
  if (receipt.bucket !== authorization.finalBucket) {
    throw new Error("verified media receipt used an unexpected final bucket");
  }
}

/**
 * A lost finalization response is safe to reconcile by invoking finalization
 * again with the SAME token/secret. The existing server contract returns the
 * verified result with `replayed: true` when that authorization already
 * finalized successfully.
 */
export function applyV3MediaFinalizeOutcome(
  upload: V3MediaUploadContinuity,
  outcome: V3MediaFinalizeOutcome,
): V3MediaUploadContinuity {
  if (upload.state !== "finalizing") {
    throw new Error(`cannot apply finalize outcome from state ${upload.state}`);
  }

  if (outcome.kind === "verified") {
    validateVerifiedReceipt(upload.authorization, outcome.receipt);
    return {
      ...upload,
      state: "verified",
      verifiedReceipt: {
        ...outcome.receipt,
        metadata: { ...outcome.receipt.metadata },
      },
      failureReason: null,
    };
  }

  if (outcome.kind === "transport_ambiguous") {
    return {
      ...upload,
      state: "finalize_uncertain",
      failureReason: null,
    };
  }

  if (outcome.kind === "quarantine_missing") {
    return {
      ...upload,
      state: "retry_upload",
      failureReason: "quarantine_missing",
    };
  }

  if (outcome.kind === "authorization_expired") {
    return {
      ...upload,
      state: "expired",
      failureReason: outcome.reason?.trim() || "authorization_expired",
    };
  }

  required(outcome.reason, "outcome.reason");
  return {
    ...upload,
    state: "rejected",
    failureReason: outcome.reason,
  };
}

export function v3MediaRecoveryAction(upload: V3MediaUploadContinuity): V3MediaRecoveryAction {
  if (upload.state === "prepared" || upload.state === "retry_upload") {
    return "upload_same_authorization";
  }
  if (upload.state === "ready_to_finalize" || upload.state === "quarantine_uncertain") {
    return "finalize_same_authorization";
  }
  if (upload.state === "finalize_uncertain") {
    return "retry_finalize_same_authorization";
  }
  return "none";
}

export function canCreateFreshV3MediaAuthorization(upload: V3MediaUploadContinuity) {
  // Never mint a second authorization merely because transport became
  // ambiguous. A fresh authorization is only eligible after the old server
  // authorization is authoritatively terminal.
  return upload.state === "rejected" || upload.state === "expired";
}

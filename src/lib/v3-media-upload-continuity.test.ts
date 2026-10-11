import { describe, expect, it } from "vitest";

import {
  applyV3MediaFinalizeOutcome,
  applyV3QuarantineUploadOutcome,
  beginV3MediaFinalization,
  beginV3QuarantineUpload,
  canCreateFreshV3MediaAuthorization,
  createV3MediaUploadContinuity,
  v3MediaRecoveryAction,
  type V3MediaUploadAuthorization,
} from "./v3-media-upload-continuity";

const AUTHORIZATION: V3MediaUploadAuthorization = {
  tokenId: "upload-42",
  quarantineBucket: "solaris-upload-quarantine",
  quarantinePath: "country_media/upload-42/source.png",
  finalBucket: "country-media",
};

function prepared() {
  return createV3MediaUploadContinuity(AUTHORIZATION);
}

describe("Solaris Studio V3 media upload continuity", () => {
  it("starts from one server-issued quarantine authorization", () => {
    const upload = prepared();

    expect(upload.state).toBe("prepared");
    expect(upload.authorization).toEqual(AUTHORIZATION);
    expect(upload.authorization).not.toBe(AUTHORIZATION);
    expect(upload.quarantineAttempts).toBe(0);
    expect(upload.finalizeAttempts).toBe(0);
    expect(v3MediaRecoveryAction(upload)).toBe("upload_same_authorization");
  });

  it("rejects non-quarantine or unsafe prepared upload descriptors", () => {
    expect(() =>
      createV3MediaUploadContinuity({
        ...AUTHORIZATION,
        quarantineBucket: "country-media",
      }),
    ).toThrow("media upload must use the Solaris quarantine bucket");

    expect(() =>
      createV3MediaUploadContinuity({
        ...AUTHORIZATION,
        quarantinePath: "../escape.png",
      }),
    ).toThrow("authorization.quarantinePath is unsafe");
  });

  it("moves a confirmed quarantine upload to finalization", () => {
    const uploading = beginV3QuarantineUpload(prepared());
    const uploaded = applyV3QuarantineUploadOutcome(uploading, {
      kind: "uploaded",
    });

    expect(uploading.quarantineAttempts).toBe(1);
    expect(uploaded.state).toBe("ready_to_finalize");
    expect(v3MediaRecoveryAction(uploaded)).toBe("finalize_same_authorization");
  });

  it("treats a lost quarantine-upload response as uncertain and finalizes the same authorization", () => {
    const uncertain = applyV3QuarantineUploadOutcome(
      beginV3QuarantineUpload(prepared()),
      { kind: "transport_ambiguous" },
    );

    expect(uncertain.state).toBe("quarantine_uncertain");
    expect(v3MediaRecoveryAction(uncertain)).toBe("finalize_same_authorization");
    expect(canCreateFreshV3MediaAuthorization(uncertain)).toBe(false);

    const finalizing = beginV3MediaFinalization(uncertain);
    expect(finalizing.state).toBe("finalizing");
    expect(finalizing.authorization.tokenId).toBe("upload-42");
  });

  it("treats Asset Already Exists as ambiguous rather than failed or verified", () => {
    const uncertain = applyV3QuarantineUploadOutcome(
      beginV3QuarantineUpload(prepared()),
      { kind: "asset_already_exists" },
    );

    expect(uncertain.state).toBe("quarantine_uncertain");
    expect(uncertain.verifiedReceipt).toBeNull();
    expect(v3MediaRecoveryAction(uncertain)).toBe("finalize_same_authorization");
  });

  it("retries the same upload authorization when finalization proves quarantine is missing", () => {
    const uncertain = applyV3QuarantineUploadOutcome(
      beginV3QuarantineUpload(prepared()),
      { kind: "transport_ambiguous" },
    );
    const missing = applyV3MediaFinalizeOutcome(
      beginV3MediaFinalization(uncertain),
      { kind: "quarantine_missing" },
    );

    expect(missing.state).toBe("retry_upload");
    expect(missing.failureReason).toBe("quarantine_missing");
    expect(v3MediaRecoveryAction(missing)).toBe("upload_same_authorization");
    expect(canCreateFreshV3MediaAuthorization(missing)).toBe(false);

    const retry = beginV3QuarantineUpload(missing);
    expect(retry.authorization).toEqual(AUTHORIZATION);
    expect(retry.quarantineAttempts).toBe(2);
  });

  it("retries finalization with the same authorization after a lost finalize response", () => {
    const ready = applyV3QuarantineUploadOutcome(
      beginV3QuarantineUpload(prepared()),
      { kind: "uploaded" },
    );
    const uncertain = applyV3MediaFinalizeOutcome(
      beginV3MediaFinalization(ready),
      { kind: "transport_ambiguous" },
    );

    expect(uncertain.state).toBe("finalize_uncertain");
    expect(v3MediaRecoveryAction(uncertain)).toBe(
      "retry_finalize_same_authorization",
    );
    expect(canCreateFreshV3MediaAuthorization(uncertain)).toBe(false);

    const retry = beginV3MediaFinalization(uncertain);
    expect(retry.finalizeAttempts).toBe(2);
    expect(retry.authorization.tokenId).toBe("upload-42");
  });

  it.each([false, true])(
    "accepts a verified finalizer receipt whether replayed is %s",
    (replayed) => {
      const ready = applyV3QuarantineUploadOutcome(
        beginV3QuarantineUpload(prepared()),
        { kind: "uploaded" },
      );
      const verified = applyV3MediaFinalizeOutcome(
        beginV3MediaFinalization(ready),
        {
          kind: "verified",
          receipt: {
            tokenId: "upload-42",
            bucket: "country-media",
            objectPath: "countries/oland/media-42.png",
            detectedMime: "image/png",
            metadata: { width: 1200, height: 800 },
            replayed,
          },
        },
      );

      expect(verified.state).toBe("verified");
      expect(verified.verifiedReceipt?.replayed).toBe(replayed);
      expect(v3MediaRecoveryAction(verified)).toBe("none");
      expect(canCreateFreshV3MediaAuthorization(verified)).toBe(false);
    },
  );

  it("rejects a verified receipt for another token or final bucket", () => {
    const ready = beginV3MediaFinalization(
      applyV3QuarantineUploadOutcome(beginV3QuarantineUpload(prepared()), {
        kind: "uploaded",
      }),
    );

    expect(() =>
      applyV3MediaFinalizeOutcome(ready, {
        kind: "verified",
        receipt: {
          tokenId: "upload-99",
          bucket: "country-media",
          objectPath: "other.png",
          detectedMime: "image/png",
          metadata: {},
          replayed: false,
        },
      }),
    ).toThrow("verified media receipt belongs to another upload authorization");

    expect(() =>
      applyV3MediaFinalizeOutcome(ready, {
        kind: "verified",
        receipt: {
          tokenId: "upload-42",
          bucket: "edition-artwork",
          objectPath: "other.png",
          detectedMime: "image/png",
          metadata: {},
          replayed: false,
        },
      }),
    ).toThrow("verified media receipt used an unexpected final bucket");
  });

  it("keeps retryable upload failures on the same authorization", () => {
    const retry = applyV3QuarantineUploadOutcome(
      beginV3QuarantineUpload(prepared()),
      {
        kind: "explicit_failure",
        reason: "temporary storage failure",
        retryable: true,
      },
    );

    expect(retry.state).toBe("retry_upload");
    expect(v3MediaRecoveryAction(retry)).toBe("upload_same_authorization");
    expect(canCreateFreshV3MediaAuthorization(retry)).toBe(false);
  });

  it("allows a fresh authorization only after the old authorization is terminal", () => {
    const rejected = applyV3QuarantineUploadOutcome(
      beginV3QuarantineUpload(prepared()),
      {
        kind: "explicit_failure",
        reason: "authorization rejected",
        retryable: false,
      },
    );
    expect(rejected.state).toBe("rejected");
    expect(canCreateFreshV3MediaAuthorization(rejected)).toBe(true);

    const ready = beginV3MediaFinalization(
      applyV3QuarantineUploadOutcome(beginV3QuarantineUpload(prepared()), {
        kind: "uploaded",
      }),
    );
    const expired = applyV3MediaFinalizeOutcome(ready, {
      kind: "authorization_expired",
      reason: "Upload authorization expired.",
    });
    expect(expired.state).toBe("expired");
    expect(canCreateFreshV3MediaAuthorization(expired)).toBe(true);
  });

  it("does not permit invalid phase jumps", () => {
    expect(() => beginV3MediaFinalization(prepared())).toThrow(
      "cannot finalize media from state prepared",
    );

    const uploading = beginV3QuarantineUpload(prepared());
    expect(() => beginV3QuarantineUpload(uploading)).toThrow(
      "cannot upload quarantine object from state uploading",
    );
  });
});

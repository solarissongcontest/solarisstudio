import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOrganizerMediaReviewTargets } from "./v3-organizer-media-review-selection";

type Asset = {
  assetKey: string;
  editionId: string;
  sourceFingerprint: string | null;
  processing: boolean;
  validation: { level: string }[];
  title: string;
};
const good: Asset = {
  assetKey: "edition-1:entry:video",
  editionId: "edition-1",
  sourceFingerprint: "sha256:abc",
  processing: false,
  validation: [{ level: "pass" }],
  title: "Performance video",
};

describe("Organizer single and bulk media review target selection", () => {
  it("uses a single exact inventory asset for detail-sheet review", () => {
    const result = resolveOrganizerMediaReviewTargets(
      [good, { ...good, assetKey: "other" }],
      new Set([good.assetKey]), "edition-1", "approved",
    );
    expect(result).toEqual([good]);
  });

  it("supports the identical guard for multi-asset bulk decisions", () => {
    const other = { ...good, assetKey: "image", title: "Artist image" };
    const result = resolveOrganizerMediaReviewTargets(
      [good, other], new Set([good.assetKey, other.assetKey]), "edition-1", "approved",
    );
    expect(result).toEqual([good, other]);
  });

  it("fails closed on a stale or forged asset identifier", () => {
    expect(() => resolveOrganizerMediaReviewTargets(
      [good], new Set(["unknown"]), "edition-1", "approved",
    )).toThrow(/no longer in the current media inventory/);
  });

  it("refuses empty selections and missing edition scope", () => {
    expect(() => resolveOrganizerMediaReviewTargets(
      [good], new Set(), "edition-1", "approved",
    )).toThrow(/Select an asset/);
    expect(() => resolveOrganizerMediaReviewTargets(
      [good], new Set([good.assetKey]), "", "approved",
    )).toThrow(/Select an asset/);
  });

  it("refuses an asset from another edition even when its key is known", () => {
    expect(() => resolveOrganizerMediaReviewTargets(
      [good], new Set([good.assetKey]), "edition-2", "invalid",
    )).toThrow(/another Organizer edition/);
  });

  it("rejects missing fingerprints and in-progress uploads for either decision", () => {
    for (const asset of [{ ...good, sourceFingerprint: null }, { ...good, processing: true }]) {
      for (const decision of ["approved", "invalid"] as const) {
        expect(() => resolveOrganizerMediaReviewTargets(
          [asset], new Set([good.assetKey]), "edition-1", decision,
        )).toThrow(/Only available/);
      }
    }
  });

  it("blocks approval on server-projected validation blockers, but permits invalidation", () => {
    const blocked = { ...good, validation: [{ level: "blocked" }] };
    expect(() => resolveOrganizerMediaReviewTargets(
      [blocked], new Set([good.assetKey]), "edition-1", "approved",
    )).toThrow(/blocking validation/);
    expect(resolveOrganizerMediaReviewTargets(
      [blocked], new Set([good.assetKey]), "edition-1", "invalid",
    )).toEqual([blocked]);
  });

  it("rejects duplicate asset keys instead of reviewing an ambiguous record twice", () => {
    expect(() => resolveOrganizerMediaReviewTargets(
      [good, { ...good }], new Set([good.assetKey]), "edition-1", "approved",
    )).toThrow(/no longer in the current media inventory/);
  });

  it("retains the canonical receipted operation for both single and bulk actions", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/_authenticated/admin/media-assets.tsx"), "utf8");
    expect(route).toContain("resolveOrganizerMediaReviewTargets(");
    expect(route).toContain("singleAssetReview");
    expect(route).toContain("onRequestReview={");
    expect(route).toContain("requestReview(decision, { assetKey, reason })");
    expect(route).toContain("prepareOrganizerMediaReviewOperation({");
    expect(route).toContain("commitOrganizerMediaReviewOperation({");
    expect(route).toContain("asset.sourceFingerprint");
    expect(route).toContain("pendingReview.operation.operationId");
    expect(route).toContain("Review this source");
  });

  it("does not allow selecting a different source to inherit a loaded preview", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/_authenticated/admin/media-assets.tsx"), "utf8");
    expect(route).toContain("source?.url ?? 'no-url'");
    expect(route).toContain("const [singleAssetReviewReason, setSingleAssetReviewReason]");
    expect(route).toContain("asset.sourceFingerprint ?? 'no-fingerprint'");
  });
});

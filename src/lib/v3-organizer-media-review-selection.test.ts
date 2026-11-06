import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { countOutdatedOrganizerMediaReviewSelections, resolveOrganizerMediaReviewTargets } from "./v3-organizer-media-review-selection";

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
      new Map([[good.assetKey, good.sourceFingerprint!]]), "edition-1", "approved",
    );
    expect(result).toEqual([good]);
  });

  it("supports the identical guard for multi-asset bulk decisions", () => {
    const other = { ...good, assetKey: "image", title: "Artist image" };
    const result = resolveOrganizerMediaReviewTargets(
      [good, other], new Map([[good.assetKey, good.sourceFingerprint!], [other.assetKey, other.sourceFingerprint!]]), "edition-1", "approved",
    );
    expect(result).toEqual([good, other]);
  });

  it("fails closed on a stale or forged asset identifier", () => {
    expect(() => resolveOrganizerMediaReviewTargets(
      [good], new Map([["unknown", "sha256:abc"]]), "edition-1", "approved",
    )).toThrow(/no longer in the current media inventory/);
  });

  it("refuses empty selections and missing edition scope", () => {
    expect(() => resolveOrganizerMediaReviewTargets(
      [good], new Map(), "edition-1", "approved",
    )).toThrow(/Select an asset/);
    expect(() => resolveOrganizerMediaReviewTargets(
      [good], new Map([[good.assetKey, good.sourceFingerprint!]]), "", "approved",
    )).toThrow(/Select an asset/);
  });

  it("refuses an asset from another edition even when its key is known", () => {
    expect(() => resolveOrganizerMediaReviewTargets(
      [good], new Map([[good.assetKey, good.sourceFingerprint!]]), "edition-2", "invalid",
    )).toThrow(/another Organizer edition/);
  });

  it("rejects missing fingerprints and in-progress uploads for either decision", () => {
    for (const asset of [{ ...good, sourceFingerprint: null }, { ...good, processing: true }]) {
      for (const decision of ["approved", "invalid"] as const) {
        expect(() => resolveOrganizerMediaReviewTargets(
          [asset], new Map([[good.assetKey, good.sourceFingerprint!]]), "edition-1", decision,
        )).toThrow(/Only available/);
      }
    }
  });

  it("blocks approval on server-projected validation blockers, but permits invalidation", () => {
    const blocked = { ...good, validation: [{ level: "blocked" }] };
    expect(() => resolveOrganizerMediaReviewTargets(
      [blocked], new Map([[good.assetKey, good.sourceFingerprint!]]), "edition-1", "approved",
    )).toThrow(/blocking validation/);
    expect(resolveOrganizerMediaReviewTargets(
      [blocked], new Map([[good.assetKey, good.sourceFingerprint!]]), "edition-1", "invalid",
    )).toEqual([blocked]);
  });

  it("rejects duplicate asset keys instead of reviewing an ambiguous record twice", () => {
    expect(() => resolveOrganizerMediaReviewTargets(
      [good, { ...good }], new Map([[good.assetKey, good.sourceFingerprint!]]), "edition-1", "approved",
    )).toThrow(/no longer in the current media inventory/);
  });

  it("refuses reviewing a replaced source using the previous checkbox selection", () => {
    expect(() => resolveOrganizerMediaReviewTargets(
      [{ ...good, sourceFingerprint: "sha256:new" }],
      new Map([[good.assetKey, "sha256:abc"]]),
      "edition-1", "approved",
    )).toThrow(/changed since selection/);
    expect(() => resolveOrganizerMediaReviewTargets(
      [{ ...good, sourceFingerprint: "sha256:new" }],
      new Map([[good.assetKey, "sha256:abc"]]),
      "edition-1", "invalid",
    )).toThrow(/changed since selection/);
  });

  it("requires an explicit new selection after a source replacement", () => {
    const updated = { ...good, sourceFingerprint: "sha256:new" };
    expect(resolveOrganizerMediaReviewTargets([updated],
      new Map([[updated.assetKey, "sha256:new"]]),
      "edition-1", "approved",
    )).toEqual([updated]);
  });

  it("detects stale source selections and distinguishes them from unchanged sources", () => {
    expect(countOutdatedOrganizerMediaReviewSelections(
      [good], new Map([[good.assetKey, "sha256:abc"]]), "edition-1",
    )).toBe(0);
    expect(countOutdatedOrganizerMediaReviewSelections(
      [{ ...good, sourceFingerprint: "sha256:changed" }],
      new Map([[good.assetKey, "sha256:abc"]]), "edition-1",
    )).toBe(1);
    expect(countOutdatedOrganizerMediaReviewSelections(
      [], new Map([[good.assetKey, "sha256:abc"]]), "edition-1",
    )).toBe(1);
    expect(countOutdatedOrganizerMediaReviewSelections(
      [good], new Map([[good.assetKey, "sha256:abc"]]), "other-edition",
    )).toBe(1);
  });

  it("rejects duplicate current keys even if both sources look identical", () => {
    expect(countOutdatedOrganizerMediaReviewSelections(
      [good, { ...good }], new Map([[good.assetKey, "sha256:abc"]]), "edition-1",
    )).toBe(1);
  });

  it("retains the canonical receipted operation for both single and bulk actions", () => {
    const route = readFileSync(resolve(process.cwd(),
      "src/routes/_authenticated/admin/media-assets.tsx"), "utf8");
    expect(route).toContain("resolveOrganizerMediaReviewTargets(");
    expect(route).toContain("singleAssetReview");
    expect(route).toContain("onRequestReview={");
    expect(route).toContain("requestReview(decision, { assetKey, sourceFingerprint, reason })");
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
    expect(route).toContain("countOutdatedOrganizerMediaReviewSelections(");
    expect(route).toContain("new Map([[singleAssetReview.assetKey, singleAssetReview.sourceFingerprint]])");
    expect(route).toContain("setSelectedSources(new Map())");
    expect(route).toContain("const [singleAssetReviewReason, setSingleAssetReviewReason]");
    expect(route).toContain("asset.sourceFingerprint ?? 'no-fingerprint'");
  });
});

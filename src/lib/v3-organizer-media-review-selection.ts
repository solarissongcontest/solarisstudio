/**
 * The Organizer may review one asset or a selected bulk set, but both paths
 * must resolve exact assets from the currently loaded, edition-scoped media
 * inventory. Never trust an identifier supplied by the detail sheet as an
 * already-authorized item.
 */
export type OrganizerMediaReviewTargetEvidence = {
  assetKey: string;
  editionId: string;
  sourceFingerprint: string | null;
  processing: boolean;
  validation: readonly { level: string }[];
};

export function resolveOrganizerMediaReviewTargets<
  T extends OrganizerMediaReviewTargetEvidence
>(
  inventory: readonly T[],
  selectedAssetKeys: ReadonlySet<string>,
  editionId: string,
  decision: "approved" | "invalid",
): T[] {
  if (!editionId || selectedAssetKeys.size === 0) {
    throw new Error("Select an asset in the current Organizer edition before reviewing.");
  }
  const targets = inventory.filter((asset) => selectedAssetKeys.has(asset.assetKey));
  if (targets.length !== selectedAssetKeys.size ||
      new Set(targets.map((asset) => asset.assetKey)).size !== targets.length) {
    throw new Error("The selected asset is no longer in the current media inventory. Reload and review again.");
  }
  for (const asset of targets) {
    if (asset.editionId !== editionId) {
      throw new Error("A selected asset belongs to another Organizer edition. Review was not prepared.");
    }
    if (!asset.sourceFingerprint || asset.processing) {
      throw new Error("Only available, non-processing sources can receive a media review decision.");
    }
    if (decision === "approved" && asset.validation.some((check) => check.level === "blocked")) {
      throw new Error("A source has blocking validation checks and cannot be approved.");
    }
  }
  return targets;
}

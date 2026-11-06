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
  selectedSources: ReadonlyMap<string, string>,
  editionId: string,
  decision: "approved" | "invalid",
): T[] {
  if (!editionId || selectedSources.size === 0) {
    throw new Error("Select an asset in the current Organizer edition before reviewing.");
  }
  const targets = inventory.filter((asset) => selectedSources.has(asset.assetKey));
  if (targets.length !== selectedSources.size ||
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
    if (selectedSources.get(asset.assetKey) !== asset.sourceFingerprint) {
      throw new Error("A selected media source changed since selection. Clear and reselect the replacement before review.");
    }
    if (decision === "approved" && asset.validation.some((check) => check.level === "blocked")) {
      throw new Error("A source has blocking validation checks and cannot be approved.");
    }
  }
  return targets;
}

/**
 * Warn without silently discarding a selection. Organizers must explicitly
 * clear/reselect a replaced source rather than accidentally reviewing it.
 */
export function countOutdatedOrganizerMediaReviewSelections(
  inventory: readonly OrganizerMediaReviewTargetEvidence[],
  selectedSources: ReadonlyMap<string, string>,
  editionId: string,
): number {
  const byKey = new Map<string, { asset: OrganizerMediaReviewTargetEvidence; count: number }>();
  for (const asset of inventory) {
    const prior = byKey.get(asset.assetKey);
    byKey.set(asset.assetKey, { asset, count: prior ? prior.count + 1 : 1 });
  }
  let outdated = 0;
  for (const [assetKey, sourceFingerprint] of selectedSources) {
    const match = byKey.get(assetKey);
    if (!match || match.count !== 1 || match.asset.editionId !== editionId ||
        !sourceFingerprint || match.asset.sourceFingerprint !== sourceFingerprint) {
      outdated += 1;
    }
  }
  return outdated;
}

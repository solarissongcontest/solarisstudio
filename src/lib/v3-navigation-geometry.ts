export const V3_NAVIGATION_GEOMETRY = {
  shellMaxWidth: 428,
  shellHeightExpanded: 58,
  shellHeightCompact: 50,
  compactHeight: 50,
  horizontalInset: 18,
  narrowHorizontalInset: 10,
  bottomInset: 10,
  shellRadius: 29,
  compactRadius: 25,
  materialPadding: 6,
  compactVerticalPadding: 3,
  slotGap: 2,
  itemMinHeightExpanded: 46,
  itemMinHeightCompact: 44,
  iconWrapSize: 24,
  iconWrapSizeCompact: 22,
  iconOpticalSize: 20,
  iconOpticalSizeCompact: 18,
  lensRadius: 20,
  lensOvershootMax: 14,
  compactWidth: 286,
  shadowSpreadBudget: 40,
  obstructionMax: 124,
  minimumTarget: 44,
} as const;

/**
 * These values describe the owner-approved V3 visual-cutover geometry. They are
 * implementation measurements, not a claim that Solaris reproduces private
 * Instagram internals. Observable reference calibration can still refine them
 * later without returning to the old oversized dock composition.
 */
export const V3_NAVIGATION_REFERENCE_STATUS = {
  status: "owner-approved-v3-visual-cutover",
  referenceValues: null,
} as const;

export function v3NavigationGeometryCssVariables() {
  const geometry = V3_NAVIGATION_GEOMETRY;
  return {
    "--v3-nav-shell-max-width": `${geometry.shellMaxWidth}px`,
    "--v3-nav-shell-height-expanded": `${geometry.shellHeightExpanded}px`,
    "--v3-nav-shell-height-compact": `${geometry.shellHeightCompact}px`,
    "--v3-nav-horizontal-inset": `${geometry.horizontalInset}px`,
    "--v3-nav-narrow-horizontal-inset": `${geometry.narrowHorizontalInset}px`,
    "--v3-nav-bottom-inset": `${geometry.bottomInset}px`,
    "--v3-nav-shell-radius": `${geometry.shellRadius}px`,
    "--v3-nav-compact-radius": `${geometry.compactRadius}px`,
    "--v3-nav-material-padding": `${geometry.materialPadding}px`,
    "--v3-nav-slot-gap": `${geometry.slotGap}px`,
    "--v3-nav-item-min-height-expanded": `${geometry.itemMinHeightExpanded}px`,
    "--v3-nav-item-min-height-compact": `${geometry.itemMinHeightCompact}px`,
    "--v3-nav-icon-wrap-size": `${geometry.iconWrapSize}px`,
    "--v3-nav-icon-wrap-size-compact": `${geometry.iconWrapSizeCompact}px`,
    "--v3-nav-icon-optical-size": `${geometry.iconOpticalSize}px`,
    "--v3-nav-icon-optical-size-compact": `${geometry.iconOpticalSizeCompact}px`,
    "--v3-nav-lens-radius": `${geometry.lensRadius}px`,
    "--v3-nav-compact-width": `${geometry.compactWidth}px`,
    "--v3-nav-obstruction-max": `${geometry.obstructionMax}px`,
    "--v3-nav-minimum-target": `${geometry.minimumTarget}px`,
  } as const;
}

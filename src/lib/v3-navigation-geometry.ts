export const V3_NAVIGATION_GEOMETRY = {
  shellMaxWidth: 414,
  shellHeightExpanded: 64,
  shellHeightCompact: 54,
  compactHeight: 54,
  horizontalInset: 14,
  narrowHorizontalInset: 10,
  bottomInset: 10,
  shellRadius: 27,
  compactRadius: 24,
  materialPadding: 6,
  slotGap: 2,
  itemMinHeightExpanded: 52,
  itemMinHeightCompact: 44,
  iconWrapSize: 26,
  iconWrapSizeCompact: 23,
  iconOpticalSize: 20,
  iconOpticalSizeCompact: 18,
  lensRadius: 20,
  lensOvershootMax: 14,
  compactWidth: 300,
  shadowSpreadBudget: 36,
  obstructionMax: 136,
  minimumTarget: 44,
} as const;

/**
 * The values above describe the current Solaris implementation geometry only.
 * They are intentionally not labelled as Instagram parity measurements until
 * the approved N0 reference package exists. Dynamic tokens such as shellWidth,
 * slotWidth, iconCenterX and lens dimensions are emitted by Browser Audit.
 */
export const V3_NAVIGATION_REFERENCE_STATUS = {
  status: "awaiting-approved-instagram-baseline",
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

export const V3_NAVIGATION_GEOMETRY = {
  shellMaxWidth: 544,
  shellHeightExpanded: 70,
  shellHeightCompact: 57,
  horizontalInset: 11,
  narrowHorizontalInset: 7,
  bottomInset: 7,
  shellRadius: 32,
  compactRadius: 28,
  materialPadding: 6,
  slotGap: 2,
  itemMinHeightExpanded: 57,
  itemMinHeightCompact: 44,
  iconWrapSize: 25,
  iconWrapSizeCompact: 22,
  iconOpticalSize: 19,
  iconOpticalSizeCompact: 17,
  lensRadius: 25,
  compactWidth: 324,
  obstructionMax: 136,
  minimumTarget: 44,
} as const;

/**
 * The values above describe the current Solaris implementation geometry only.
 * They are intentionally not labelled as Instagram parity measurements until
 * the approved N0 reference package exists. N14 comparison tooling can consume
 * the same named token set once the frozen reference values are supplied.
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

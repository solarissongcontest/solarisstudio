export const V3_NAVIGATION_REFERENCE_STATES = [
  "expanded-resting",
  "compact-scrolled",
  "first-selected",
  "middle-selected",
  "last-selected",
  "pressed",
  "lens-moving",
  "dark",
  "light",
  "high-detail-under-glass",
  "swipe-25",
  "swipe-50",
  "swipe-75",
  "swipe-cancelled",
  "swipe-committed",
] as const;

export type V3NavigationReferenceState =
  (typeof V3_NAVIGATION_REFERENCE_STATES)[number];

export type V3NavigationReferenceGeometry = {
  shellWidth: number;
  shellMaxWidth: number;
  shellHeightExpanded: number;
  shellHeightCompact: number;
  horizontalInset: number;
  bottomInset: number;
  shellRadius: number;
  slotWidth: number;
  iconOpticalSize: number;
  iconCenterX: number[];
  lensWidth: number;
  lensHeight: number;
  lensRadius: number;
  lensCenterX: number;
  lensOvershootMax: number;
  compactWidth: number;
  compactHeight: number;
  shadowSpreadBudget: number;
  viewportWidth: number;
};

export type V3NavigationReferenceBaseline = {
  status: "pending" | "approved";
  captureDate: string | null;
  instagramAppVersion: string | null;
  iosVersion: string | null;
  iphoneModelOrViewport: string | null;
  displayScale: number | null;
  appearance: "light" | "dark" | "both" | null;
  approvedBy: string | null;
  states: Partial<Record<V3NavigationReferenceState, string>>;
  geometry: V3NavigationReferenceGeometry | null;
};

export type V3NavigationGeometryComparison = {
  pass: boolean;
  failures: string[];
  deltas: Record<string, number>;
};

export const V3_NAVIGATION_REFERENCE_TOLERANCES = {
  majorDimensionPx: 4,
  iconCenterPx: 2,
  lensCenterPx: 2,
  safeAreaPlacementPx: 4,
  overallProportionRatio: 0.03,
} as const;

const REQUIRED_RESTING_STATES: readonly V3NavigationReferenceState[] = [
  "expanded-resting",
  "compact-scrolled",
  "first-selected",
  "middle-selected",
  "last-selected",
  "pressed",
  "lens-moving",
  "dark",
  "light",
  "high-detail-under-glass",
];

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateV3NavigationReferenceBaseline(
  baseline: V3NavigationReferenceBaseline,
) {
  const failures: string[] = [];
  if (baseline.status !== "approved") failures.push("baseline.status must be approved");
  if (!baseline.captureDate) failures.push("captureDate is required");
  if (!baseline.iosVersion) failures.push("iosVersion is required");
  if (!baseline.iphoneModelOrViewport) failures.push("iphoneModelOrViewport is required");
  if (!finitePositive(baseline.displayScale)) failures.push("displayScale must be positive");
  if (!baseline.appearance) failures.push("appearance is required");
  if (!baseline.approvedBy) failures.push("approvedBy is required");
  for (const state of REQUIRED_RESTING_STATES) {
    if (!baseline.states[state]) failures.push(`missing reference state: ${state}`);
  }
  if (!baseline.geometry) {
    failures.push("geometry is required");
  } else {
    const requiredDimensions = [
      "shellWidth", "shellMaxWidth", "shellHeightExpanded", "shellHeightCompact",
      "horizontalInset", "bottomInset", "shellRadius", "slotWidth", "iconOpticalSize",
      "lensWidth", "lensHeight", "lensRadius", "lensCenterX", "lensOvershootMax",
      "compactWidth", "compactHeight", "shadowSpreadBudget", "viewportWidth",
    ] as const satisfies readonly (keyof V3NavigationReferenceGeometry)[];
    for (const key of requiredDimensions) {
      if (!finitePositive(baseline.geometry[key])) failures.push(`geometry.${key} must be positive`);
    }
    if (!Array.isArray(baseline.geometry.iconCenterX) || baseline.geometry.iconCenterX.length !== 5) {
      failures.push("geometry.iconCenterX must contain five tab centers");
    } else if (baseline.geometry.iconCenterX.some((value) => !finitePositive(value))) {
      failures.push("geometry.iconCenterX must contain finite values");
    }
  }
  return { pass: failures.length === 0, failures } as const;
}

function delta(
  key: string,
  actual: number,
  reference: number,
  tolerance: number,
  failures: string[],
  deltas: Record<string, number>,
) {
  const value = Math.abs(actual - reference);
  deltas[key] = value;
  if (value > tolerance) {
    failures.push(`${key} differs by ${value.toFixed(2)}px (limit ${tolerance}px)`);
  }
}

export function compareV3NavigationGeometry(
  actual: V3NavigationReferenceGeometry,
  reference: V3NavigationReferenceGeometry,
  tolerances = V3_NAVIGATION_REFERENCE_TOLERANCES,
): V3NavigationGeometryComparison {
  const failures: string[] = [];
  const deltas: Record<string, number> = {};

  for (const key of [
    "shellWidth",
    "shellMaxWidth",
    "shellHeightExpanded",
    "shellHeightCompact",
    "shellRadius",
    "slotWidth",
    "iconOpticalSize",
    "lensWidth",
    "lensHeight",
    "lensRadius",
    "lensOvershootMax",
    "compactWidth",
    "compactHeight",
    "shadowSpreadBudget",
  ] as const) {
    delta(
      key,
      actual[key],
      reference[key],
      tolerances.majorDimensionPx,
      failures,
      deltas,
    );
  }

  delta(
    "horizontalInset",
    actual.horizontalInset,
    reference.horizontalInset,
    tolerances.safeAreaPlacementPx,
    failures,
    deltas,
  );
  delta(
    "bottomInset",
    actual.bottomInset,
    reference.bottomInset,
    tolerances.safeAreaPlacementPx,
    failures,
    deltas,
  );
  delta(
    "lensCenterX",
    actual.lensCenterX,
    reference.lensCenterX,
    tolerances.lensCenterPx,
    failures,
    deltas,
  );

  if (actual.iconCenterX.length !== reference.iconCenterX.length) {
    failures.push("iconCenterX length differs from the approved reference");
  } else {
    actual.iconCenterX.forEach((center, index) => {
      delta(
        `iconCenterX[${index}]`,
        center,
        reference.iconCenterX[index]!,
        tolerances.iconCenterPx,
        failures,
        deltas,
      );
    });
  }

  const actualProportion = actual.shellWidth / Math.max(1, actual.viewportWidth);
  const referenceProportion = reference.shellWidth / Math.max(1, reference.viewportWidth);
  const proportionDelta = Math.abs(actualProportion - referenceProportion);
  deltas.overallProportionRatio = proportionDelta;
  if (proportionDelta > tolerances.overallProportionRatio) {
    failures.push(
      `overall shell proportion differs by ${(proportionDelta * 100).toFixed(2)} percentage points`,
    );
  }

  return { pass: failures.length === 0, failures, deltas };
}

export type V3RuntimeEvidenceState = "missing" | "foundation" | "implemented";

export type V3NavigationRuntimeSourceBundle = {
  appRuntime: string;
  swipeSurface: string;
  serviceWorker: string | null;
};

export type V3NavigationRuntimeEvidence = {
  gestureArbitration: V3RuntimeEvidenceState;
  standalonePwa: V3RuntimeEvidenceState;
  safeUpdates: V3RuntimeEvidenceState;
  resumeReconciliation: V3RuntimeEvidenceState;
  offlineShell: V3RuntimeEvidenceState;
  pwaAggregate: V3RuntimeEvidenceState;
  evidence: {
    gestureArbitration: string[];
    standalonePwa: string[];
    safeUpdates: string[];
    resumeReconciliation: string[];
    offlineShell: string[];
  };
};

function all(source: string, needles: readonly (string | RegExp)[]) {
  return needles.every((needle) =>
    typeof needle === "string" ? source.includes(needle) : needle.test(source),
  );
}

function minState(states: readonly V3RuntimeEvidenceState[]): V3RuntimeEvidenceState {
  if (states.includes("missing")) return "missing";
  if (states.includes("foundation")) return "foundation";
  return "implemented";
}

export function evaluateV3NavigationRuntimeEvidence(
  source: V3NavigationRuntimeSourceBundle,
): V3NavigationRuntimeEvidence {
  const gestureMarkers: (string | RegExp)[] = [
    "elementBlocksV3TopLevelSwipe",
    "isV3BrowserEdgeGestureStart",
    "classifyV3SwipeIntent",
    "resolveV3TopLevelSwipePolicy",
    "shellInteractionBlocked",
  ];
  const standaloneMarkers: (string | RegExp)[] = [
    "detectSolarisPlatform",
    /display-mode:\s*standalone/,
    "platform.isAppMode",
  ];
  const safeUpdateMarkers: (string | RegExp)[] = [
    "appUpdateSafety",
    "updatefound",
    "controllerchange",
    "controllerReloadPending",
    "SKIP_WAITING",
  ];
  const resumeMarkers: (string | RegExp)[] = [
    "APP_RESUME_EVENT",
    "createAppLifecycleController",
    /registration\?\.update\(\)/,
  ];

  const gestureArbitration = all(source.swipeSurface, gestureMarkers)
    ? "implemented"
    : source.swipeSurface.length > 0
      ? "foundation"
      : "missing";
  const standalonePwa = all(source.appRuntime, standaloneMarkers)
    ? "implemented"
    : source.appRuntime.length > 0
      ? "foundation"
      : "missing";
  const safeUpdates = all(source.appRuntime, safeUpdateMarkers)
    ? "implemented"
    : source.appRuntime.length > 0
      ? "foundation"
      : "missing";
  const resumeReconciliation = all(source.appRuntime, resumeMarkers)
    ? "implemented"
    : source.appRuntime.length > 0
      ? "foundation"
      : "missing";
  const offlineShell = source.serviceWorker?.trim()
    ? "foundation"
    : "missing";

  return {
    gestureArbitration,
    standalonePwa,
    safeUpdates,
    resumeReconciliation,
    offlineShell,
    // Offline shell presence is only foundation evidence. It must not drag the
    // already-implemented runtime lifecycle back to "foundation"; the release
    // matrix remains a separate higher-level certification gate.
    pwaAggregate: minState([standalonePwa, safeUpdates, resumeReconciliation]),
    evidence: {
      gestureArbitration: gestureMarkers.map(String),
      standalonePwa: standaloneMarkers.map(String),
      safeUpdates: safeUpdateMarkers.map(String),
      resumeReconciliation: resumeMarkers.map(String),
      offlineShell: source.serviceWorker?.trim() ? ["service worker source present"] : [],
    },
  };
}

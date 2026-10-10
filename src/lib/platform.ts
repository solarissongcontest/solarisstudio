export type SolarisRuntimeMode = "web" | "standalone" | "native";

export type SolarisPlatformSnapshot = {
  mode: SolarisRuntimeMode;
  isAppMode: boolean;
  isStandalone: boolean;
  isNative: boolean;
  isOnline: boolean;
  canInstallServiceWorker: boolean;
  canPush: boolean;
  canNotify: boolean;
  canBadge: boolean;
  canShare: boolean;
};

type IOSNavigator = Navigator & {
  standalone?: boolean;
  setAppBadge?: (contents?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
};

export function hydrationSafeSolarisPlatformSnapshot(): SolarisPlatformSnapshot {
  return {
    mode: "web",
    isAppMode: false,
    isStandalone: false,
    isNative: false,
    isOnline: true,
    canInstallServiceWorker: false,
    canPush: false,
    canNotify: false,
    canBadge: false,
    canShare: false,
  };
}

export function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false;
  const mediaStandalone = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
  const windowControlsOverlay =
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches ?? false;
  const iosStandalone = Boolean((window.navigator as IOSNavigator).standalone);
  return mediaStandalone || windowControlsOverlay || iosStandalone;
}

export function isNativeSolarisRuntime() {
  if (typeof window === "undefined") return false;
  return Boolean((window as CapacitorWindow).Capacitor?.isNativePlatform?.());
}

export function detectSolarisPlatform(): SolarisPlatformSnapshot {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return hydrationSafeSolarisPlatformSnapshot();
  }

  const isNative = isNativeSolarisRuntime();
  const isStandalone = isStandaloneDisplayMode();
  const mode: SolarisRuntimeMode = isNative ? "native" : isStandalone ? "standalone" : "web";
  const nav = navigator as IOSNavigator;

  return {
    mode,
    isAppMode: isNative || isStandalone,
    isStandalone,
    isNative,
    isOnline: navigator.onLine,
    canInstallServiceWorker: "serviceWorker" in navigator,
    canPush: "serviceWorker" in navigator && "PushManager" in window,
    canNotify: "Notification" in window,
    canBadge: typeof nav.setAppBadge === "function" || typeof nav.clearAppBadge === "function",
    canShare: typeof navigator.share === "function",
  };
}

export async function setSolarisAppBadge(count: number) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as IOSNavigator;
  if (count > 0 && typeof nav.setAppBadge === "function") {
    await nav.setAppBadge(count);
  } else if (count <= 0 && typeof nav.clearAppBadge === "function") {
    await nav.clearAppBadge();
  }
}

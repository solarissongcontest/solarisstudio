import { useRouterState } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppOverlayManager } from "@/components/app/AppOverlayManager";
import {
  createAppConnectivityController,
  hydrationSafeAppConnectivitySnapshot,
  type AppConnectivitySnapshot,
} from "@/lib/app-connectivity";
import {
  APP_RESUME_EVENT,
  createAppLifecycleController,
  type AppLifecycleSnapshot,
} from "@/lib/app-lifecycle";
import {
  appUpdateSafety,
  subscribeAppUpdateSafety,
} from "@/lib/app-update-safety";
import {
  createAppViewportController,
  type AppViewportSnapshot,
} from "@/lib/app-viewport";
import {
  detectSolarisPlatform,
  type SolarisPlatformSnapshot,
} from "@/lib/platform";
import { refreshAppPushSubscription } from "@/lib/app-notifications";
import { supabase } from "@/integrations/supabase/client";

type AppRuntimeValue = SolarisPlatformSnapshot & {
  connectivity: AppConnectivitySnapshot;
  lifecycle: AppLifecycleSnapshot;
  viewport: AppViewportSnapshot;
  updateAvailable: boolean;
  updateDeferred: boolean;
  updateBlockedReason: string | null;
  applyUpdate: () => void;
};

const HYDRATION_SAFE_PLATFORM: SolarisPlatformSnapshot = {
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
const SERVER_CONNECTIVITY = hydrationSafeAppConnectivitySnapshot();
const HYDRATION_SAFE_LIFECYCLE: AppLifecycleSnapshot = {
  phase: "foreground",
  lastBackgroundAt: null,
  lastResumeAt: null,
  backgroundDurationMs: 0,
};
const HYDRATION_SAFE_VIEWPORT: AppViewportSnapshot = {
  viewportWidth: 0,
  viewportHeight: 0,
  viewportOffsetLeft: 0,
  viewportOffsetTop: 0,
  viewportScale: 1,
  keyboardInset: 0,
  keyboardOpen: false,
};

const AppRuntimeContext = createContext<AppRuntimeValue>({
  ...HYDRATION_SAFE_PLATFORM,
  connectivity: SERVER_CONNECTIVITY,
  lifecycle: HYDRATION_SAFE_LIFECYCLE,
  viewport: HYDRATION_SAFE_VIEWPORT,
  updateAvailable: false,
  updateDeferred: false,
  updateBlockedReason: null,
  applyUpdate: () => undefined,
});

export function AppRuntime({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [platform, setPlatform] = useState<SolarisPlatformSnapshot>(
    HYDRATION_SAFE_PLATFORM,
  );
  const [connectivity, setConnectivity] = useState<AppConnectivitySnapshot>(() =>
    hydrationSafeAppConnectivitySnapshot(),
  );
  const [lifecycle, setLifecycle] = useState<AppLifecycleSnapshot>(
    HYDRATION_SAFE_LIFECYCLE,
  );
  const [viewport, setViewport] = useState<AppViewportSnapshot>(
    HYDRATION_SAFE_VIEWPORT,
  );
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [, setUpdateSafetyRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setPlatform(detectSolarisPlatform());
    const standalone = window.matchMedia?.("(display-mode: standalone)");
    const windowControlsOverlay = window.matchMedia?.("(display-mode: window-controls-overlay)");

    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    standalone?.addEventListener?.("change", refresh);
    windowControlsOverlay?.addEventListener?.("change", refresh);

    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      standalone?.removeEventListener?.("change", refresh);
      windowControlsOverlay?.removeEventListener?.("change", refresh);
    };
  }, []);

  useEffect(() => createAppLifecycleController(setLifecycle), []);
  useEffect(() => createAppConnectivityController(setConnectivity), []);
  useEffect(() => createAppViewportController(setViewport), []);
  useEffect(
    () =>
      subscribeAppUpdateSafety(() =>
        setUpdateSafetyRevision((revision) => revision + 1),
      ),
    [],
  );

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.solarisRuntime = platform.mode;
    root.dataset.solarisConnectivity = connectivity.status;
    root.dataset.solarisLifecycle = lifecycle.phase;
    root.toggleAttribute("data-solaris-app", platform.isAppMode);
    root.removeAttribute("data-solaris-app-boot");
    return () => {
      delete root.dataset.solarisRuntime;
      delete root.dataset.solarisConnectivity;
      delete root.dataset.solarisLifecycle;
      root.removeAttribute("data-solaris-app");
    };
  }, [connectivity.status, lifecycle.phase, platform.isAppMode, platform.mode]);

  useEffect(() => {
    if (!platform.isAppMode) return;

    let active = true;
    const syncPushSubscription = async () => {
      if (!active || !navigator.onLine) return;
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (!userId || !active) return;
        await refreshAppPushSubscription(userId);
      } catch (error) {
        console.warn("[solaris-push] Existing device subscription sync failed", error);
      }
    };

    void syncPushSubscription();
    window.addEventListener("online", syncPushSubscription);
    window.addEventListener(APP_RESUME_EVENT, syncPushSubscription);

    return () => {
      active = false;
      window.removeEventListener("online", syncPushSubscription);
      window.removeEventListener(APP_RESUME_EVENT, syncPushSubscription);
    };
  }, [platform.isAppMode]);

  useEffect(() => {
    if (!import.meta.env.PROD || !platform.canInstallServiceWorker) return;

    let active = true;
    let registration: ServiceWorkerRegistration | null = null;

    const inspectWaiting = (next: ServiceWorkerRegistration) => {
      if (active && next.waiting) setWaitingWorker(next.waiting);
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((next) => {
        if (!active) return;
        registration = next;
        inspectWaiting(next);

        next.addEventListener("updatefound", () => {
          const installing = next.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller &&
              active
            ) {
              setWaitingWorker(next.waiting ?? installing);
            }
          });
        });

        return next.update();
      })
      .catch((error) => {
        console.warn("Solaris service worker registration failed", error);
      });

    const onControllerChange = () => {
      if (!active) return;
      window.location.reload();
    };
    const onResume = () => {
      if (active) void registration?.update().catch(() => undefined);
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    window.addEventListener(APP_RESUME_EVENT, onResume);

    return () => {
      active = false;
      registration = null;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener(APP_RESUME_EVENT, onResume);
    };
  }, [platform.canInstallServiceWorker]);

  const updateSafety = appUpdateSafety(pathname);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker || !updateSafety.safe) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  }, [updateSafety.safe, waitingWorker]);

  const value = useMemo<AppRuntimeValue>(
    () => ({
      ...platform,
      connectivity,
      lifecycle,
      viewport,
      updateAvailable: Boolean(waitingWorker),
      updateDeferred: Boolean(waitingWorker) && !updateSafety.safe,
      updateBlockedReason: updateSafety.reason,
      applyUpdate,
    }),
    [
      applyUpdate,
      connectivity,
      lifecycle,
      platform,
      updateSafety.reason,
      updateSafety.safe,
      viewport,
      waitingWorker,
    ],
  );

  return (
    <AppRuntimeContext.Provider value={value}>
      {children}
      <AppOverlayManager
        isAppMode={platform.isAppMode}
        pathname={pathname}
        connectivity={connectivity}
        updateAvailable={Boolean(waitingWorker)}
        updateSafe={updateSafety.safe}
        onUpdate={applyUpdate}
      />
    </AppRuntimeContext.Provider>
  );
}

export function useSolarisApp() {
  return useContext(AppRuntimeContext);
}

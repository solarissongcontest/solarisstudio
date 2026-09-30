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

import { AppInstallPrompt } from "@/components/app/AppInstallPrompt";
import { AppOfflineBanner } from "@/components/app/AppOfflineBanner";
import { AppUpdatePrompt } from "@/components/app/AppUpdatePrompt";
import {
  createAppConnectivityController,
  initialAppConnectivitySnapshot,
  type AppConnectivitySnapshot,
} from "@/lib/app-connectivity";
import {
  APP_RESUME_EVENT,
  createAppLifecycleController,
  initialAppLifecycleSnapshot,
  type AppLifecycleSnapshot,
} from "@/lib/app-lifecycle";
import {
  appUpdateSafety,
  subscribeAppUpdateSafety,
} from "@/lib/app-update-safety";
import {
  createAppViewportController,
  initialAppViewportSnapshot,
  type AppViewportSnapshot,
} from "@/lib/app-viewport";
import {
  detectSolarisPlatform,
  type SolarisPlatformSnapshot,
} from "@/lib/platform";

type AppRuntimeValue = SolarisPlatformSnapshot & {
  connectivity: AppConnectivitySnapshot;
  lifecycle: AppLifecycleSnapshot;
  viewport: AppViewportSnapshot;
  updateAvailable: boolean;
  updateDeferred: boolean;
  updateBlockedReason: string | null;
  applyUpdate: () => void;
};

const SERVER_SNAPSHOT = detectSolarisPlatform();
const SERVER_CONNECTIVITY = initialAppConnectivitySnapshot();
const SERVER_LIFECYCLE = initialAppLifecycleSnapshot();
const SERVER_VIEWPORT = initialAppViewportSnapshot();

const AppRuntimeContext = createContext<AppRuntimeValue>({
  ...SERVER_SNAPSHOT,
  connectivity: SERVER_CONNECTIVITY,
  lifecycle: SERVER_LIFECYCLE,
  viewport: SERVER_VIEWPORT,
  updateAvailable: false,
  updateDeferred: false,
  updateBlockedReason: null,
  applyUpdate: () => undefined,
});

export function AppRuntime({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [platform, setPlatform] = useState<SolarisPlatformSnapshot>(() =>
    detectSolarisPlatform(),
  );
  const [connectivity, setConnectivity] = useState<AppConnectivitySnapshot>(() =>
    initialAppConnectivitySnapshot(),
  );
  const [lifecycle, setLifecycle] = useState<AppLifecycleSnapshot>(() =>
    initialAppLifecycleSnapshot(),
  );
  const [viewport, setViewport] = useState<AppViewportSnapshot>(() =>
    initialAppViewportSnapshot(),
  );
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [, setUpdateSafetyRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setPlatform(detectSolarisPlatform());
    const standalone = window.matchMedia?.("(display-mode: standalone)");

    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    standalone?.addEventListener?.("change", refresh);

    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      standalone?.removeEventListener?.("change", refresh);
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
    return () => {
      delete root.dataset.solarisRuntime;
      delete root.dataset.solarisConnectivity;
      delete root.dataset.solarisLifecycle;
      root.removeAttribute("data-solaris-app");
    };
  }, [connectivity.status, lifecycle.phase, platform.isAppMode, platform.mode]);

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
      {platform.isAppMode ? (
        <AppOfflineBanner connectivity={connectivity} />
      ) : null}
      {platform.isAppMode && waitingWorker && updateSafety.safe ? (
        <AppUpdatePrompt onUpdate={applyUpdate} />
      ) : null}
    </AppRuntimeContext.Provider>
  );
}

export function useSolarisApp() {
  return useContext(AppRuntimeContext);
}

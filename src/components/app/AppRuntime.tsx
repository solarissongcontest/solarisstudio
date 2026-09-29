import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AppOfflineBanner } from "@/components/app/AppOfflineBanner";
import { AppUpdatePrompt } from "@/components/app/AppUpdatePrompt";
import {
  detectSolarisPlatform,
  type SolarisPlatformSnapshot,
} from "@/lib/platform";

type AppRuntimeValue = SolarisPlatformSnapshot & {
  updateAvailable: boolean;
  applyUpdate: () => void;
};

const SERVER_SNAPSHOT = detectSolarisPlatform();

const AppRuntimeContext = createContext<AppRuntimeValue>({
  ...SERVER_SNAPSHOT,
  updateAvailable: false,
  applyUpdate: () => undefined,
});

export function AppRuntime({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<SolarisPlatformSnapshot>(() =>
    detectSolarisPlatform(),
  );
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

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

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.solarisRuntime = platform.mode;
    root.toggleAttribute("data-solaris-app", platform.isAppMode);
    return () => {
      delete root.dataset.solarisRuntime;
      root.removeAttribute("data-solaris-app");
    };
  }, [platform.isAppMode, platform.mode]);

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
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      active = false;
      registration = null;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [platform.canInstallServiceWorker]);

  const applyUpdate = useCallback(() => {
    waitingWorker?.postMessage({ type: "SKIP_WAITING" });
  }, [waitingWorker]);

  const value = useMemo<AppRuntimeValue>(
    () => ({
      ...platform,
      updateAvailable: Boolean(waitingWorker),
      applyUpdate,
    }),
    [applyUpdate, platform, waitingWorker],
  );

  return (
    <AppRuntimeContext.Provider value={value}>
      {children}
      {platform.isAppMode ? <AppOfflineBanner /> : null}
      {platform.isAppMode && waitingWorker ? (
        <AppUpdatePrompt onUpdate={applyUpdate} />
      ) : null}
    </AppRuntimeContext.Provider>
  );
}

export function useSolarisApp() {
  return useContext(AppRuntimeContext);
}

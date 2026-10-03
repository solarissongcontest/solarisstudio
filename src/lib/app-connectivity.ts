import { APP_RESUME_EVENT } from "@/lib/app-lifecycle";
import {
  SUPABASE_SERVICE_RECOVERED_EVENT,
  SUPABASE_SERVICE_RESTRICTION_EVENT,
  readSupabaseServiceRestriction,
} from "@/lib/supabase-service-restriction";

export const APP_CONNECTIVITY_RECOVERED_EVENT = "solaris:app-connectivity-recovered";

export type AppConnectivityStatus =
  | "online"
  | "offline"
  | "degraded"
  | "service-restricted";

export type AppConnectivitySnapshot = {
  status: AppConnectivityStatus;
  navigatorOnline: boolean;
  originReachable: boolean | null;
  serviceRestricted: boolean;
  checkedAt: string | null;
};

const PROBE_TIMEOUT_MS = 5_000;

export function hydrationSafeAppConnectivitySnapshot(): AppConnectivitySnapshot {
  return {
    status: "online",
    navigatorOnline: true,
    originReachable: null,
    serviceRestricted: false,
    checkedAt: null,
  };
}

export function initialAppConnectivitySnapshot(): AppConnectivitySnapshot {
  const navigatorOnline =
    typeof navigator === "undefined" ? true : navigator.onLine;
  const serviceRestricted = Boolean(readSupabaseServiceRestriction());
  return {
    status: !navigatorOnline
      ? "offline"
      : serviceRestricted
        ? "service-restricted"
        : "online",
    navigatorOnline,
    originReachable: navigatorOnline ? null : false,
    serviceRestricted,
    checkedAt: null,
  };
}

async function probeOrigin(signal?: AbortSignal) {
  const response = await fetch(
    `/site.webmanifest?solaris_connectivity_probe=${Date.now()}`,
    {
      cache: "no-store",
      credentials: "same-origin",
      signal,
      headers: { "x-solaris-connectivity-probe": "1" },
    },
  );
  return response.ok;
}

export function createAppConnectivityController(
  onChange: (snapshot: AppConnectivitySnapshot) => void,
) {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return () => undefined;
  }

  let disposed = false;
  let snapshot = initialAppConnectivitySnapshot();
  let probeController: AbortController | null = null;

  const emit = () => {
    if (!disposed) onChange({ ...snapshot });
  };

  const applyStatus = () => {
    snapshot.status = !snapshot.navigatorOnline
      ? "offline"
      : snapshot.serviceRestricted
        ? "service-restricted"
        : snapshot.originReachable === false
          ? "degraded"
          : "online";
  };

  const runProbe = async () => {
    probeController?.abort();
    const previousStatus = snapshot.status;
    if (!navigator.onLine) {
      snapshot = {
        ...snapshot,
        navigatorOnline: false,
        originReachable: false,
        checkedAt: new Date().toISOString(),
      };
      applyStatus();
      emit();
      return;
    }

    const controller = new AbortController();
    probeController = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, PROBE_TIMEOUT_MS);

    try {
      const reachable = await probeOrigin(controller.signal);
      if (disposed || controller.signal.aborted) return;
      snapshot = {
        ...snapshot,
        navigatorOnline: true,
        originReachable: reachable,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      if (disposed) return;
      if (controller.signal.aborted && !timedOut) return;
      snapshot = {
        ...snapshot,
        navigatorOnline: navigator.onLine,
        originReachable: false,
        checkedAt: new Date().toISOString(),
      };
    } finally {
      window.clearTimeout(timeout);
      if (probeController === controller) probeController = null;
    }

    snapshot.serviceRestricted = Boolean(readSupabaseServiceRestriction());
    applyStatus();
    emit();

    if (previousStatus !== "online" && snapshot.status === "online") {
      window.dispatchEvent(
        new CustomEvent(APP_CONNECTIVITY_RECOVERED_EVENT, {
          detail: { recoveredAt: snapshot.checkedAt },
        }),
      );
    }
  };

  const onOnline = () => {
    snapshot = {
      ...snapshot,
      navigatorOnline: true,
      originReachable: false,
    };
    applyStatus();
    emit();
    void runProbe();
  };

  const onOffline = () => {
    snapshot = {
      ...snapshot,
      navigatorOnline: false,
      originReachable: false,
      checkedAt: new Date().toISOString(),
    };
    applyStatus();
    emit();
  };

  const onRestriction = () => {
    snapshot = {
      ...snapshot,
      serviceRestricted: true,
    };
    applyStatus();
    emit();
  };

  const onRecovered = () => {
    snapshot = {
      ...snapshot,
      serviceRestricted: false,
      originReachable: false,
    };
    applyStatus();
    emit();
    void runProbe();
  };

  const onResume = () => void runProbe();

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener(SUPABASE_SERVICE_RESTRICTION_EVENT, onRestriction);
  window.addEventListener(SUPABASE_SERVICE_RECOVERED_EVENT, onRecovered);
  window.addEventListener(APP_RESUME_EVENT, onResume);

  emit();
  if (snapshot.navigatorOnline) void runProbe();

  return () => {
    disposed = true;
    probeController?.abort();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener(SUPABASE_SERVICE_RESTRICTION_EVENT, onRestriction);
    window.removeEventListener(SUPABASE_SERVICE_RECOVERED_EVENT, onRecovered);
    window.removeEventListener(APP_RESUME_EVENT, onResume);
  };
}

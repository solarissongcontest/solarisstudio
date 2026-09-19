import { supabase } from "@/integrations/supabase/client";
import {
  getPublicUxSessionId,
  publicUxDevice,
} from "@/lib/public-ux-events";

export type PublicWebVitalName = "LCP" | "INP" | "CLS";
export type PublicWebVitalRating = "good" | "needs-improvement" | "poor";

type WebVitalsInsertClient = {
  from(name: string): {
    insert(payload: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  };
};

type LayoutShiftEntry = PerformanceEntry & {
  value: number;
  hadRecentInput: boolean;
};

type EventTimingEntry = PerformanceEntry & {
  duration: number;
  interactionId?: number;
};

const client = supabase as unknown as WebVitalsInsertClient;

export function ratePublicWebVital(
  metric: PublicWebVitalName,
  value: number,
): PublicWebVitalRating {
  if (metric === "LCP") {
    if (value <= 2_500) return "good";
    if (value <= 4_000) return "needs-improvement";
    return "poor";
  }

  if (metric === "INP") {
    if (value <= 200) return "good";
    if (value <= 500) return "needs-improvement";
    return "poor";
  }

  if (value <= 0.1) return "good";
  if (value <= 0.25) return "needs-improvement";
  return "poor";
}

export function startPublicWebVitals() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return () => undefined;
  }
  if (window.navigator.webdriver) return () => undefined;
  if (window.location.pathname.startsWith("/admin")) return () => undefined;

  const pathname = safePathname(window.location.pathname);
  const supported = new Set(PerformanceObserver.supportedEntryTypes ?? []);
  const observers: PerformanceObserver[] = [];
  const interactionDurations = new Map<number, number>();

  let lcp: number | null = null;
  let cls = 0;
  let clsSessionValue = 0;
  let clsSessionStart = 0;
  let clsSessionLast = 0;
  let fallbackInp: number | null = null;
  let flushed = false;

  if (supported.has("largest-contentful-paint")) {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const latest = entries[entries.length - 1];
      if (latest) lcp = latest.startTime;
    });
    observer.observe({ type: "largest-contentful-paint", buffered: true });
    observers.push(observer);
  }

  if (supported.has("layout-shift")) {
    const observer = new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const entry = raw as LayoutShiftEntry;
        if (entry.hadRecentInput) continue;

        if (
          clsSessionValue > 0 &&
          entry.startTime - clsSessionLast < 1_000 &&
          entry.startTime - clsSessionStart < 5_000
        ) {
          clsSessionValue += entry.value;
          clsSessionLast = entry.startTime;
        } else {
          clsSessionValue = entry.value;
          clsSessionStart = entry.startTime;
          clsSessionLast = entry.startTime;
        }

        cls = Math.max(cls, clsSessionValue);
      }
    });
    observer.observe({ type: "layout-shift", buffered: true });
    observers.push(observer);
  }

  if (supported.has("event")) {
    const observer = new PerformanceObserver((list) => {
      for (const raw of list.getEntries()) {
        const entry = raw as EventTimingEntry;
        if (!Number.isFinite(entry.duration) || entry.duration <= 0) continue;

        const interactionId = entry.interactionId ?? 0;
        if (interactionId > 0) {
          interactionDurations.set(
            interactionId,
            Math.max(interactionDurations.get(interactionId) ?? 0, entry.duration),
          );
        } else {
          fallbackInp = Math.max(fallbackInp ?? 0, entry.duration);
        }
      }
    });

    try {
      observer.observe({
        type: "event",
        buffered: true,
        durationThreshold: 40,
      } as PerformanceObserverInit);
      observers.push(observer);
    } catch {
      observer.disconnect();
    }
  }

  const flush = () => {
    if (flushed) return;
    flushed = true;

    if (lcp != null) {
      reportPublicWebVital("LCP", lcp, pathname);
    }

    if (supported.has("layout-shift")) {
      reportPublicWebVital("CLS", cls, pathname);
    }

    const inp = estimateInp(interactionDurations, fallbackInp);
    if (inp != null) {
      reportPublicWebVital("INP", inp, pathname);
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") flush();
  };

  document.addEventListener("visibilitychange", onVisibilityChange, { passive: true });
  window.addEventListener("pagehide", flush, { passive: true });

  return () => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", flush);
    for (const observer of observers) observer.disconnect();
  };
}

function estimateInp(
  interactions: ReadonlyMap<number, number>,
  fallback: number | null,
) {
  if (!interactions.size) return fallback;

  const values = [...interactions.values()].sort((a, b) => b - a);
  // INP approximates the worst interaction while allowing one outlier per
  // 50 interactions, matching the percentile intent of the Web Vitals metric.
  const index = Math.min(Math.floor(values.length / 50), values.length - 1);
  return values[index] ?? fallback;
}

function reportPublicWebVital(
  metric: PublicWebVitalName,
  rawValue: number,
  pathname: string,
) {
  if (!Number.isFinite(rawValue) || rawValue < 0) return;

  const value =
    metric === "CLS"
      ? Math.round(rawValue * 1_000) / 1_000
      : Math.round(rawValue);

  const navigation = performance.getEntriesByType("navigation")[0] as
    | (PerformanceNavigationTiming & { type?: string })
    | undefined;
  const navigationType = normalizeNavigationType(navigation?.type);

  const payload = {
    session_id: getPublicUxSessionId(),
    pathname,
    metric_name: metric,
    value,
    rating: ratePublicWebVital(metric, value),
    device: publicUxDevice(),
    viewport_width: Math.max(1, Math.min(10_000, Math.round(window.innerWidth))),
    viewport_height: Math.max(1, Math.min(10_000, Math.round(window.innerHeight))),
    navigation_type: navigationType,
  };

  void Promise.resolve(client.from("public_web_vitals").insert(payload)).catch(
    () => undefined,
  );
}

function normalizeNavigationType(value?: string) {
  if (
    value === "navigate" ||
    value === "reload" ||
    value === "back_forward" ||
    value === "prerender"
  ) {
    return value;
  }
  return "unknown";
}

function safePathname(value: string) {
  const path = value.startsWith("/") ? value : "/";
  return path.slice(0, 512);
}

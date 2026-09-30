export type AppLifecyclePhase = "foreground" | "background";

export type AppResumeDetail = {
  resumedAt: string;
  backgroundDurationMs: number;
};

export const APP_RESUME_EVENT = "solaris:app-resume";

export type AppLifecycleSnapshot = {
  phase: AppLifecyclePhase;
  lastBackgroundAt: string | null;
  lastResumeAt: string | null;
  backgroundDurationMs: number;
};

export function initialAppLifecycleSnapshot(): AppLifecycleSnapshot {
  const visible =
    typeof document === "undefined" ? true : document.visibilityState !== "hidden";
  return {
    phase: visible ? "foreground" : "background",
    lastBackgroundAt: null,
    lastResumeAt: null,
    backgroundDurationMs: 0,
  };
}

export function createAppLifecycleController(
  onChange: (snapshot: AppLifecycleSnapshot) => void,
) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  let snapshot = initialAppLifecycleSnapshot();
  let backgroundStartedAt: number | null =
    snapshot.phase === "background" ? Date.now() : null;

  const emit = () => onChange({ ...snapshot });

  const enterBackground = () => {
    if (snapshot.phase === "background") return;
    const now = Date.now();
    backgroundStartedAt = now;
    snapshot = {
      ...snapshot,
      phase: "background",
      lastBackgroundAt: new Date(now).toISOString(),
    };
    emit();
  };

  const enterForeground = () => {
    const now = Date.now();
    const duration =
      backgroundStartedAt == null ? 0 : Math.max(0, now - backgroundStartedAt);
    const wasBackground = snapshot.phase === "background" || backgroundStartedAt != null;
    backgroundStartedAt = null;
    snapshot = {
      ...snapshot,
      phase: "foreground",
      lastResumeAt: wasBackground ? new Date(now).toISOString() : snapshot.lastResumeAt,
      backgroundDurationMs: wasBackground ? duration : snapshot.backgroundDurationMs,
    };
    emit();

    if (wasBackground) {
      window.dispatchEvent(
        new CustomEvent<AppResumeDetail>(APP_RESUME_EVENT, {
          detail: {
            resumedAt: snapshot.lastResumeAt ?? new Date(now).toISOString(),
            backgroundDurationMs: duration,
          },
        }),
      );
    }
  };

  const refreshFromVisibility = () => {
    if (document.visibilityState === "hidden") enterBackground();
    else enterForeground();
  };

  const onPageHide = () => enterBackground();
  const onPageShow = () => enterForeground();

  document.addEventListener("visibilitychange", refreshFromVisibility);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("pageshow", onPageShow);

  emit();

  return () => {
    document.removeEventListener("visibilitychange", refreshFromVisibility);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("pageshow", onPageShow);
  };
}

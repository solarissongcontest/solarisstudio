import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "solaris:pwa-install-dismissed";
const VISITS_KEY = "solaris:pwa-meaningful-visits:v1";
const SESSION_COUNTED_KEY = "solaris:pwa-visit-counted:v1";
const DISMISS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_VISITS_BEFORE_PROMOTION = 2;

function isIOSBrowser() {
  if (typeof navigator === "undefined") return false;
  return /iP(?:hone|ad|od)/.test(navigator.userAgent);
}

function readVisitCount() {
  try {
    const parsed = Number(window.localStorage.getItem(VISITS_KEY) ?? "0");
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  } catch {
    return 0;
  }
}

function recentlyDismissed() {
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    const timestamp = Number(raw);
    return Number.isFinite(timestamp) && Date.now() - timestamp < DISMISS_WINDOW_MS;
  } catch {
    return false;
  }
}

export function AppInstallPrompt({ suppressed = false }: { suppressed?: boolean }) {
  const { isAppMode } = useSolarisApp();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [eligible, setEligible] = useState(false);
  const ios = isIOSBrowser();

  useEffect(() => {
    if (typeof window === "undefined") return;

    let visits = readVisitCount();
    try {
      if (window.sessionStorage.getItem(SESSION_COUNTED_KEY) !== "1") {
        visits += 1;
        window.localStorage.setItem(VISITS_KEY, String(visits));
        window.sessionStorage.setItem(SESSION_COUNTED_KEY, "1");
      }
    } catch {
      // Storage is an enhancement only. Do not block the site.
    }

    setDismissed(recentlyDismissed());
    setEligible(visits >= MIN_VISITS_BEFORE_PROMOTION);

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (
    isAppMode ||
    suppressed ||
    dismissed ||
    !eligible ||
    (!ios && !installEvent)
  ) {
    return null;
  }

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // The current component state is still enough to dismiss this prompt.
    }
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    dismiss();
  };

  return (
    <aside className="solaris-install-prompt" aria-label="Install Solaris Studio">
      <span className="solaris-install-icon">
        {ios ? (
          <Share className="size-4" aria-hidden="true" />
        ) : (
          <Download className="size-4" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Use Solaris Studio as an app</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {ios
            ? "In Safari, tap Share and Add to Home Screen for standalone navigation, notifications and app features."
            : "Install Solaris Studio for standalone navigation, notifications and app features."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!ios && installEvent ? (
          <button
            type="button"
            onClick={() => void install()}
            className="solaris-install-action"
          >
            Install
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismiss}
          className="solaris-install-dismiss"
          aria-label="Dismiss install suggestion"
        >
          ×
        </button>
      </div>
    </aside>
  );
}

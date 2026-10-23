import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { resolveSolarisAppScreen } from "@/lib/app-screen-registry";
import { useHydrationSafeRouterLocation } from "@/lib/hydration-safe-router-location";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type BrowserStorageName = "localStorage" | "sessionStorage";

const DISMISSED_KEY = "solaris:pwa-install-dismissed";
const VISIT_COUNT_KEY = "solaris:pwa-install-visits:v1";
const SESSION_COUNTED_KEY = "solaris:pwa-install-session-counted:v1";
const MIN_VISITS = 2;
const REVEAL_DELAY_MS = 8_000;

function isIOSBrowser() {
  if (typeof navigator === "undefined") return false;
  return /iP(?:hone|ad|od)/.test(navigator.userAgent);
}

function optionalBrowserStorage(name: BrowserStorageName) {
  if (typeof window === "undefined") return null;
  try {
    return window[name];
  } catch {
    return null;
  }
}

function readOptionalStorage(storage: Storage | null, key: string) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeOptionalStorage(storage: Storage | null, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Install-prompt persistence is optional. Storage restrictions must not break Solaris.
  }
}

export function installPromptAllowedOnPath(pathname: string) {
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    /^\/(auth|reset|recover)(\/|$)/.test(pathname)
  ) {
    return false;
  }

  const screen = resolveSolarisAppScreen(pathname);
  return !screen.behavior.criticalTask && !screen.behavior.immersive;
}

export function AppInstallPrompt({ isAppMode }: { isAppMode: boolean }) {
  const { pathname } = useHydrationSafeRouterLocation();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [eligible, setEligible] = useState(false);
  const ios = isIOSBrowser();

  useEffect(() => {
    if (typeof window === "undefined" || isAppMode) return;

    const localStorage = optionalBrowserStorage("localStorage");
    const sessionStorage = optionalBrowserStorage("sessionStorage");
    let visits = Number(readOptionalStorage(localStorage, VISIT_COUNT_KEY) ?? "0");
    if (readOptionalStorage(sessionStorage, SESSION_COUNTED_KEY) !== "1") {
      visits = Number.isFinite(visits) ? visits + 1 : 1;
      writeOptionalStorage(localStorage, VISIT_COUNT_KEY, String(visits));
      writeOptionalStorage(sessionStorage, SESSION_COUNTED_KEY, "1");
    }

    const wasDismissed = readOptionalStorage(localStorage, DISMISSED_KEY) === "1";
    setDismissed(wasDismissed);

    const timer = window.setTimeout(() => {
      setEligible(!wasDismissed && visits >= MIN_VISITS);
    }, REVEAL_DELAY_MS);

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, [isAppMode]);

  if (
    isAppMode ||
    dismissed ||
    !eligible ||
    !installPromptAllowedOnPath(pathname) ||
    (!ios && !installEvent)
  ) {
    return null;
  }

  const dismiss = () => {
    writeOptionalStorage(optionalBrowserStorage("localStorage"), DISMISSED_KEY, "1");
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") dismiss();
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
            ? "In Safari, tap Share, then Add to Home Screen for standalone navigation, notifications and app features."
            : "Install Solaris Studio for standalone navigation, notifications and app features."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!ios && installEvent ? (
          <button type="button" onClick={() => void install()} className="solaris-install-action">
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

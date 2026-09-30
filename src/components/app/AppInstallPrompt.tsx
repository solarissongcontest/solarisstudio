import { useRouterState } from "@tanstack/react-router";
import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "solaris:pwa-install-dismissed";
const VISIT_COUNT_KEY = "solaris:pwa-install-visits:v1";
const SESSION_COUNTED_KEY = "solaris:pwa-install-session-counted:v1";
const MIN_VISITS = 2;
const REVEAL_DELAY_MS = 8_000;

function isIOSBrowser() {
  if (typeof navigator === "undefined") return false;
  return /iP(?:hone|ad|od)/.test(navigator.userAgent);
}

function installPromptAllowedOnPath(pathname: string) {
  return !(
    pathname.startsWith("/admin") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/confirmations") ||
    pathname.startsWith("/jury-voting") ||
    pathname.startsWith("/televoting") ||
    pathname.startsWith("/next-in-line") ||
    pathname.startsWith("/broadcast/")
  );
}

export function AppInstallPrompt({ isAppMode }: { isAppMode: boolean }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [eligible, setEligible] = useState(false);
  const ios = isIOSBrowser();

  useEffect(() => {
    if (typeof window === "undefined" || isAppMode) return;

    let visits = Number(window.localStorage.getItem(VISIT_COUNT_KEY) ?? "0");
    if (window.sessionStorage.getItem(SESSION_COUNTED_KEY) !== "1") {
      visits = Number.isFinite(visits) ? visits + 1 : 1;
      window.localStorage.setItem(VISIT_COUNT_KEY, String(visits));
      window.sessionStorage.setItem(SESSION_COUNTED_KEY, "1");
    }

    const wasDismissed = window.localStorage.getItem(DISMISSED_KEY) === "1";
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
    window.localStorage.setItem(DISMISSED_KEY, "1");
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

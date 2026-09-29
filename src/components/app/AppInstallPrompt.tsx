import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED_KEY = "solaris:pwa-install-dismissed";

function isIOSBrowser() {
  if (typeof navigator === "undefined") return false;
  return /iP(?:hone|ad|od)/.test(navigator.userAgent);
}

export function AppInstallPrompt() {
  const { isAppMode } = useSolarisApp();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const ios = isIOSBrowser();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");

    const handler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isAppMode || dismissed || (!ios && !installEvent)) return null;

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
        {ios ? <Share className="size-4" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install Solaris Studio</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {ios
            ? "In Safari, tap Share and Add to Home Screen for the full app experience."
            : "Install the app for standalone navigation, offline fallback and app features."}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!ios && installEvent ? (
          <button type="button" onClick={() => void install()} className="solaris-install-action">
            Install
          </button>
        ) : null}
        <button type="button" onClick={dismiss} className="solaris-install-dismiss" aria-label="Dismiss install suggestion">
          ×
        </button>
      </div>
    </aside>
  );
}

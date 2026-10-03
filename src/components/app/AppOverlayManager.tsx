import { useEffect, useState } from "react";

import { AppFirstRun, appFirstRunComplete } from "@/components/app/AppFirstRun";
import { AppInstallPrompt } from "@/components/app/AppInstallPrompt";
import { AppOfflineBanner } from "@/components/app/AppOfflineBanner";
import { AppUpdatePrompt } from "@/components/app/AppUpdatePrompt";
import type { AppConnectivitySnapshot } from "@/lib/app-connectivity";

export function AppOverlayManager({
  isAppMode,
  pathname,
  connectivity,
  updateAvailable,
  updateSafe,
  onUpdate,
}: {
  isAppMode: boolean;
  pathname: string;
  connectivity: AppConnectivitySnapshot;
  updateAvailable: boolean;
  updateSafe: boolean;
  onUpdate: () => void;
}) {
  const [firstRunComplete, setFirstRunComplete] = useState(() => !isAppMode || appFirstRunComplete());

  useEffect(() => {
    setFirstRunComplete(!isAppMode || appFirstRunComplete());
  }, [isAppMode, pathname]);

  useEffect(() => {
    if (!isAppMode || typeof document === "undefined") return;

    const root = document.documentElement;
    const selector =
      '[data-solaris-sheet][data-state="open"], [data-solaris-dialog][data-state="open"]';

    const sync = () => {
      const active = document.querySelector(selector);
      root.toggleAttribute("data-solaris-feature-overlay-open", Boolean(active));
      if (active instanceof HTMLElement) {
        root.dataset.solarisOverlayKind = active.hasAttribute("data-solaris-dialog")
          ? "dialog"
          : "sheet";
      } else {
        delete root.dataset.solarisOverlayKind;
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-state"],
    });

    return () => {
      observer.disconnect();
      root.removeAttribute("data-solaris-feature-overlay-open");
      delete root.dataset.solarisOverlayKind;
    };
  }, [isAppMode]);

  if (!isAppMode) {
    return <AppInstallPrompt isAppMode={false} />;
  }

  if (connectivity.status !== "online") {
    return <AppOfflineBanner connectivity={connectivity} />;
  }

  if (!firstRunComplete) {
    return (
      <AppFirstRun
        isAppMode
        pathname={pathname}
        onComplete={() => setFirstRunComplete(true)}
      />
    );
  }

  if (updateAvailable && updateSafe) {
    return <AppUpdatePrompt onUpdate={onUpdate} />;
  }

  return null;
}

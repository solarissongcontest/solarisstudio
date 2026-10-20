import { useEffect, useState } from "react";

import { AppChromeMetrics } from "@/components/app/AppChromeMetrics";
import { AppFirstRun, appFirstRunComplete } from "@/components/app/AppFirstRun";
import { AppInstallPrompt } from "@/components/app/AppInstallPrompt";
import { AppOfflineBanner } from "@/components/app/AppOfflineBanner";
import { AppUpdatePrompt } from "@/components/app/AppUpdatePrompt";
import type { AppConnectivitySnapshot } from "@/lib/app-connectivity";

const TERRAOS_TEASER_PREVIEW_PATH = "/terraos-teaser-preview";

const PERSISTENT_NAVIGATION_SELECTOR = [
  ".solaris-app-tabbar",
  "[data-v3-liquid-tabbar]",
  ".admin-mobile-nav[data-v6-organizer-tabbar]",
].join(",");

const OVERLAY_NAV_INERT_OWNER = "data-solaris-overlay-nav-inert-owner";
const OVERLAY_NAV_ARIA_OWNER = "data-solaris-overlay-nav-aria-owner";

function setPersistentNavigationIsolation(blocked: boolean) {
  if (typeof document === "undefined") return;

  document
    .querySelectorAll<HTMLElement>(PERSISTENT_NAVIGATION_SELECTOR)
    .forEach((navigation) => {
      if (blocked) {
        const focused = document.activeElement;
        if (focused instanceof HTMLElement && navigation.contains(focused)) {
          // Do not leave keyboard/screen-reader focus parked inside chrome that
          // is about to become inert/aria-hidden. The opening dialog/sheet or
          // active form owns its own focus destination/restoration semantics.
          focused.blur();
        }
        if (!navigation.hasAttribute("inert")) {
          navigation.setAttribute("inert", "");
          navigation.setAttribute(OVERLAY_NAV_INERT_OWNER, "overlay-manager");
        }
        if (navigation.getAttribute("aria-hidden") !== "true") {
          navigation.setAttribute("aria-hidden", "true");
          navigation.setAttribute(OVERLAY_NAV_ARIA_OWNER, "overlay-manager");
        }
        return;
      }

      if (navigation.getAttribute(OVERLAY_NAV_INERT_OWNER) === "overlay-manager") {
        navigation.removeAttribute("inert");
        navigation.removeAttribute(OVERLAY_NAV_INERT_OWNER);
      }
      if (navigation.getAttribute(OVERLAY_NAV_ARIA_OWNER) === "overlay-manager") {
        navigation.removeAttribute("aria-hidden");
        navigation.removeAttribute(OVERLAY_NAV_ARIA_OWNER);
      }
    });
}

export function AppOverlayManager({
  isAppMode,
  pathname,
  connectivity,
  updatePromptAvailable,
  updateSafe,
  onUpdate,
}: {
  isAppMode: boolean;
  pathname: string;
  connectivity: AppConnectivitySnapshot;
  /** True only when there is still a waiting worker the user can activate. */
  updatePromptAvailable: boolean;
  updateSafe: boolean;
  onUpdate: () => void;
}) {
  const teaserPreview = pathname === TERRAOS_TEASER_PREVIEW_PATH;
  const [firstRunComplete, setFirstRunComplete] = useState(() => !isAppMode || appFirstRunComplete());

  useEffect(() => {
    if (teaserPreview) return;
    setFirstRunComplete(!isAppMode || appFirstRunComplete());
  }, [isAppMode, pathname, teaserPreview]);

  useEffect(() => {
    if (teaserPreview || typeof document === "undefined") return;

    const root = document.documentElement;
    root.dataset.solarisChromeOwner = "overlay-manager";
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
      delete root.dataset.solarisChromeOwner;
    };
  }, [teaserPreview]);

  useEffect(() => {
    if (teaserPreview || typeof document === "undefined") return;

    const root = document.documentElement;
    const syncNavigationIsolation = () => {
      const blocked =
        root.hasAttribute("data-solaris-feature-overlay-open") ||
        root.hasAttribute("data-solaris-keyboard-open");
      setPersistentNavigationIsolation(blocked);
    };

    syncNavigationIsolation();

    const rootObserver = new MutationObserver(syncNavigationIsolation);
    rootObserver.observe(root, {
      attributes: true,
      attributeFilter: [
        "data-solaris-feature-overlay-open",
        "data-solaris-keyboard-open",
      ],
    });

    // Persistent chrome may mount after a keyboard/sheet already owns the
    // viewport. Re-apply the current state to newly inserted navigation rather
    // than allowing one focusable frame to leak behind the active surface.
    const mountObserver = new MutationObserver(syncNavigationIsolation);
    mountObserver.observe(document.body, { subtree: true, childList: true });

    return () => {
      rootObserver.disconnect();
      mountObserver.disconnect();
      setPersistentNavigationIsolation(false);
    };
  }, [teaserPreview]);

  if (teaserPreview) return null;

  let overlay = null;

  if (!isAppMode) {
    overlay = <AppInstallPrompt isAppMode={false} />;
  } else if (connectivity.status !== "online") {
    overlay = <AppOfflineBanner connectivity={connectivity} />;
  } else if (!firstRunComplete) {
    overlay = (
      <AppFirstRun
        isAppMode
        pathname={pathname}
        onComplete={() => setFirstRunComplete(true)}
      />
    );
  } else if (updatePromptAvailable && updateSafe) {
    overlay = <AppUpdatePrompt onUpdate={onUpdate} />;
  }

  return (
    <>
      <AppChromeMetrics />
      {overlay}
    </>
  );
}

import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, CircleHelp, MoreHorizontal } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import { AppNativeShareButton } from "@/components/app/AppNativeShareButton";
import { PublicCommandPalette } from "@/components/public/PublicCommandPalette";
import { SheetTrigger } from "@/components/ui/sheet";
import type { AccountAccess } from "@/lib/country-account";
import {
  appEntryHref,
  markAppNavigationRestore,
  peekAppBackTarget,
  popAppBackTarget,
  type AppHistoryEntry,
} from "@/lib/app-navigation";
import { resolveAppRouteChrome } from "@/lib/app-route-chrome";
import { readAppSearchReturn } from "@/lib/app-search-state";
import { runAppViewTransition } from "@/lib/app-view-transitions";
import { useScrollMorphProgress } from "@/lib/use-scroll-morph-progress";

export function AppToolbar({
  pathname,
  searchStr,
  access,
}: {
  pathname: string;
  searchStr: string;
  access: AccountAccess;
}) {
  const navigate = useNavigate();
  const chrome = resolveAppRouteChrome(pathname, searchStr);
  const morphProgress = useScrollMorphProgress({
    resetKey: `${pathname}|${searchStr}`,
  });
  const toolbarStyle = {
    display: "block",
    "--solaris-toolbar-title-scale": (1.04 - morphProgress * 0.04).toFixed(4),
    "--solaris-toolbar-title-y": `${(1 - morphProgress) * 1.5}px`,
    "--solaris-toolbar-bg-top-alpha": (0.60 + morphProgress * 0.10).toFixed(3),
    "--solaris-toolbar-bg-bottom-alpha": (0.44 + morphProgress * 0.10).toFixed(3),
  } as CSSProperties;
  const [backTarget, setBackTarget] = useState<AppHistoryEntry | null>(null);

  useEffect(() => {
    setBackTarget(peekAppBackTarget(pathname, searchStr));
  }, [pathname, searchStr]);

  const fallback = chrome.backFallback;
  const searchReturn = chrome.root ? null : readAppSearchReturn(pathname);
  const historyChrome = backTarget
    ? resolveAppRouteChrome(backTarget.pathname, backTarget.searchStr)
    : null;
  const effectiveBackTarget =
    !chrome.root && backTarget && historyChrome?.tab === chrome.tab
      ? backTarget
      : null;
  const showBack = !chrome.root && Boolean(searchReturn || effectiveBackTarget || fallback);
  const toolbarOwnsHeading =
    chrome.archetype === "task" ||
    chrome.archetype === "settings" ||
    chrome.archetype === "workspace" ||
    chrome.archetype === "directory";
  const showCenteredContextTitle =
    toolbarOwnsHeading && (showBack || chrome.archetype === "directory");
  const backLabel = searchReturn
    ? "Search"
    : effectiveBackTarget
      ? historyChrome?.title
      : fallback?.label;

  const goBack = () => {
    if (searchReturn) {
      void runAppViewTransition("pop", () =>
        navigate({ to: searchReturn.originPath as any }),
      );
      return;
    }

    if (effectiveBackTarget) {
      const target = popAppBackTarget(pathname, searchStr);
      if (target) {
        markAppNavigationRestore(target);
        void runAppViewTransition("pop", () =>
          navigate({ to: appEntryHref(target) as any }),
        );
        return;
      }
    }
    if (fallback) {
      void runAppViewTransition("pop", () =>
        navigate({ to: fallback.to as any }),
      );
    }
  };

  return (
    <header
      className="solaris-app-toolbar"
      data-app-screen={chrome.archetype}
      data-search-mode={chrome.search}
      data-scroll-compressed={morphProgress > 0.72 ? "true" : "false"}
      style={toolbarStyle}
    >
      <div className="solaris-app-toolbar-inner">
        <div className="min-w-0 flex-1">
          {showBack ? (
            <button
              type="button"
              className="solaris-app-back"
              aria-label={`Back to ${backLabel ?? "previous screen"}`}
              onClick={goBack}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
              <span>{backLabel ?? "Back"}</span>
            </button>
          ) : chrome.root && !showCenteredContextTitle ? (
            <h1 className="solaris-app-toolbar-title">{chrome.title}</h1>
          ) : !chrome.root && !showCenteredContextTitle ? (
            <span className="solaris-app-toolbar-title">{chrome.title}</span>
          ) : null}
        </div>

        {showCenteredContextTitle ? (
          <h1 className="solaris-app-toolbar-context-title">{chrome.title}</h1>
        ) : null}

        <div className="flex items-center gap-1">
          {chrome.archetype === "task" ? (
            chrome.helpTo ? (
              <Link
                to={chrome.helpTo as any}
                className="solaris-app-toolbar-button"
                aria-label="Help"
              >
                <CircleHelp className="size-5" aria-hidden="true" />
              </Link>
            ) : null
          ) : (
            <>
              {chrome.archetype === "entity" ? (
                <AppNativeShareButton />
              ) : chrome.search === "global" ? (
                <PublicCommandPalette compact access={access} />
              ) : null}
              <SheetTrigger asChild>
                <button type="button" className="solaris-app-toolbar-button" aria-label="More">
                  <MoreHorizontal className="size-5" aria-hidden="true" />
                </button>
              </SheetTrigger>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
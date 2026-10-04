import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, CircleHelp, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const [backTarget, setBackTarget] = useState<AppHistoryEntry | null>(null);
  const toolbarRef = useRef<HTMLElement | null>(null);

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
  const hasLargeTitle = chrome.archetype === "directory";
  const backLabel = searchReturn
    ? "Search"
    : effectiveBackTarget
      ? historyChrome?.title
      : fallback?.label;

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar || !hasLargeTitle) return;

    let frame: number | null = null;
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    const update = () => {
      frame = null;
      const rawProgress = Math.min(1, Math.max(0, window.scrollY / 64));
      const progress = reducedMotion ? (window.scrollY > 32 ? 1 : 0) : rawProgress;

      toolbar.style.setProperty(
        "--solaris-toolbar-collapse-progress",
        progress.toFixed(3),
      );
      toolbar.style.setProperty(
        "--solaris-toolbar-large-height",
        `${(54 * (1 - progress)).toFixed(2)}px`,
      );
      toolbar.style.setProperty(
        "--solaris-toolbar-large-padding",
        `${(12 * (1 - progress)).toFixed(2)}px`,
      );
      toolbar.style.setProperty(
        "--solaris-toolbar-large-shift",
        `${(-5 * progress).toFixed(2)}px`,
      );
      toolbar.style.setProperty(
        "--solaris-toolbar-compact-opacity",
        progress.toFixed(3),
      );
      toolbar.dataset.titleCollapsed = progress > 0.92 ? "true" : "false";
    };

    const onScroll = () => {
      if (frame != null) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame != null) window.cancelAnimationFrame(frame);
      toolbar.style.removeProperty("--solaris-toolbar-collapse-progress");
      toolbar.style.removeProperty("--solaris-toolbar-large-height");
      toolbar.style.removeProperty("--solaris-toolbar-large-padding");
      toolbar.style.removeProperty("--solaris-toolbar-large-shift");
      toolbar.style.removeProperty("--solaris-toolbar-compact-opacity");
      delete toolbar.dataset.titleCollapsed;
    };
  }, [hasLargeTitle, pathname, searchStr]);

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
      ref={toolbarRef}
      className="solaris-app-toolbar"
      data-app-screen={chrome.archetype}
      data-collapsible-title={hasLargeTitle ? "true" : undefined}
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
          ) : chrome.root ? (
            <h1 className="solaris-app-toolbar-title">{chrome.title}</h1>
          ) : (
            <span className="solaris-app-toolbar-title">{chrome.title}</span>
          )}
        </div>

        {showBack && toolbarOwnsHeading ? (
          hasLargeTitle ? (
            <span
              className="solaris-app-toolbar-context-title solaris-app-toolbar-context-title-collapsible"
              aria-hidden="true"
            >
              {chrome.title}
            </span>
          ) : (
            <h1 className="solaris-app-toolbar-context-title">{chrome.title}</h1>
          )
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
              ) : (
                <PublicCommandPalette compact access={access} />
              )}
              <SheetTrigger asChild>
                <button type="button" className="solaris-app-toolbar-button" aria-label="More">
                  <MoreHorizontal className="size-5" aria-hidden="true" />
                </button>
              </SheetTrigger>
            </>
          )}
        </div>
      </div>
      {hasLargeTitle ? (
        <div className="solaris-app-large-title">
          <h1>{chrome.title}</h1>
        </div>
      ) : null}
    </header>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

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
  const chrome = resolveAppRouteChrome(pathname);
  const [backTarget, setBackTarget] = useState<AppHistoryEntry | null>(null);

  useEffect(() => {
    setBackTarget(peekAppBackTarget(pathname, searchStr));
  }, [pathname, searchStr]);

  const fallback = chrome.backFallback;
  const backLabel = backTarget
    ? resolveAppRouteChrome(backTarget.pathname).title
    : fallback?.label;

  const goBack = () => {
    const target = popAppBackTarget(pathname, searchStr);
    if (target) {
      markAppNavigationRestore(target);
      void navigate({ to: appEntryHref(target) as any });
      return;
    }
    if (fallback) {
      void navigate({ to: fallback.to as any });
    }
  };

  return (
    <header className="solaris-app-toolbar" data-app-screen={chrome.archetype}>
      <div className="solaris-app-toolbar-inner">
        <div className="min-w-0 flex-1">
          {backTarget || fallback ? (
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

        {chrome.archetype !== "immersive" ? (
          <div className="flex items-center gap-1">
            {chrome.archetype !== "task" ? (
              <PublicCommandPalette compact access={access} />
            ) : null}
            <SheetTrigger asChild>
              <button type="button" className="solaris-app-toolbar-button" aria-label="More">
                <MoreHorizontal className="size-5" aria-hidden="true" />
              </button>
            </SheetTrigger>
          </div>
        ) : null}
      </div>
    </header>
  );
}

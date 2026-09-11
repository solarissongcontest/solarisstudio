import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, ChevronDown, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { ContextualRuleGuide } from "@/components/rules/ContextualRuleGuide";
import { cn } from "@/lib/utils";

const DESKTOP_HOST_ATTR = "data-solaris-rules-nav-host";
const MOBILE_HOST_ATTR = "data-solaris-rules-mobile-nav-host";

function pathMatches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function desktopNavClass(active: boolean) {
  return cn(
    "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-surface-strong text-foreground"
      : "text-muted-foreground hover:bg-surface hover:text-foreground",
  );
}

function mobileDrawerLink(active: boolean) {
  return cn(
    "mb-1 flex min-h-11 items-center rounded-xl border px-3 text-sm font-semibold transition-colors",
    active
      ? "border-primary/15 bg-surface-strong text-foreground"
      : "border-transparent text-muted-foreground hover:bg-surface hover:text-foreground",
  );
}

function getOrCreateDesktopHost() {
  const nav = document.querySelector<HTMLElement>('nav[aria-label="Main navigation"]');
  if (!nav) return null;

  const existing = nav.querySelector<HTMLElement>(`[${DESKTOP_HOST_ATTR}]`);
  if (existing) return existing;

  const nativeRules = nav.querySelector('a[href="/rules"], details[data-native-rules-nav]');
  if (nativeRules) return null;

  const host = document.createElement("span");
  host.setAttribute(DESKTOP_HOST_ATTR, "true");
  host.style.display = "contents";

  const guide = nav.querySelector<HTMLElement>('a[href="/guide"]');
  if (guide) nav.insertBefore(host, guide);
  else nav.appendChild(host);

  return host;
}

function getOrCreateMobileHost() {
  const nav = document.querySelector<HTMLElement>('nav[aria-label="Mobile navigation"]');
  if (!nav) return null;

  const existing = nav.querySelector<HTMLElement>(`[${MOBILE_HOST_ATTR}]`);
  if (existing) return existing;

  const nativeRules = nav.querySelector('a[href="/rules"]');
  if (nativeRules) return null;

  const host = document.createElement("div");
  host.setAttribute(MOBILE_HOST_ATTR, "true");

  const mySolarisSection = Array.from(nav.children).find((child) =>
    child.textContent?.includes("MySolaris"),
  );
  if (mySolarisSection) nav.insertBefore(host, mySolarisSection);
  else nav.appendChild(host);

  return host;
}

export function GlobalRulesNavigationAddon() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [desktopHost, setDesktopHost] = useState<HTMLElement | null>(null);
  const [mobileHost, setMobileHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => {
      setDesktopHost(getOrCreateDesktopHost());
      setMobileHost(getOrCreateMobileHost());
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      document.querySelector(`[${DESKTOP_HOST_ATTR}]`)?.remove();
      document.querySelector(`[${MOBILE_HOST_ATTR}]`)?.remove();
    };
  }, []);

  const rulesActive = pathMatches(pathname, "/rules");
  const integrityActive = pathMatches(pathname, "/integrity");
  const groupActive = rulesActive || integrityActive;

  return (
    <>
      {desktopHost
        ? createPortal(
            <details
              key={`rules-navigation-${pathname}`}
              className="group relative"
              data-solaris-rules-menu
            >
              <summary
                className={cn(
                  desktopNavClass(groupActive),
                  "flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden",
                )}
              >
                Rules
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <div className="nav-menu-panel absolute left-0 top-[calc(100%+.6rem)] w-80 overflow-hidden rounded-2xl border border-border/70 p-2 shadow-2xl">
                <Link to="/rules" className="nav-menu-item">
                  <span className="flex items-center gap-2 font-semibold text-foreground">
                    <BookOpen className="size-4 text-sky-200" /> Official SSC rules
                  </span>
                  <span className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    Explore the visual Rule Map or open the complete 21-chapter regulations
                  </span>
                </Link>
                <Link to="/integrity" className="nav-menu-item">
                  <span className="flex items-center gap-2 font-semibold text-foreground">
                    <ShieldCheck className="size-4 text-emerald-200" /> Trust & Integrity
                  </span>
                  <span className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    Report a concern anonymously or return to a protected case
                  </span>
                </Link>
              </div>
            </details>,
            desktopHost,
          )
        : null}

      {mobileHost
        ? createPortal(
            <div className="mb-5 border-t border-border/55 pt-4">
              <p className="mb-1.5 px-2 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">
                Rules & integrity
              </p>
              <Link to="/rules" className={mobileDrawerLink(rulesActive)}>
                <BookOpen className="mr-2 size-4" /> Official SSC rules
              </Link>
              <Link to="/integrity" className={mobileDrawerLink(integrityActive)}>
                <ShieldCheck className="mr-2 size-4" /> Trust & Integrity
              </Link>
            </div>,
            mobileHost,
          )
        : null}

      <ContextualRuleGuide />
    </>
  );
}

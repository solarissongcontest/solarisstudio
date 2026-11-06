import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  publicAreaForPath,
  publicDestinationsForArea,
  publicPathMatches,
  type PublicArea,
} from "@/lib/public-navigation";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import { cn } from "@/lib/utils";

// AppShell can be route-owned and remount on navigation. Keep only a transient,
// public route path in this browser module so the new shell can consume the
// keyboard focus hand-off after the old disclosure unmounts.
let pendingKeyboardSectionFocus: { path: string; at: number } | null = null;

export function PublicMobileSectionNav({ pathname }: { pathname: string }) {
  const area = publicAreaForPath(pathname);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);

  // Browser history and direct links must not carry an expanded menu to a new page.
  useEffect(() => {
    setOpen(false);
    const pending = pendingKeyboardSectionFocus;
    if (!pending || pending.path !== pathname) return;
    pendingKeyboardSectionFocus = null;
    if (Date.now() - pending.at > 5_000) return;

    // A route transition may replace the focused link (and sometimes the
    // disclosure trigger). After the new page paints, focus its heading so
    // keyboard and screen-reader users enter the destination instead of
    // falling back to the document body.
    const frame = window.requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>(".public-site-content h1");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      } else {
        triggerRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  // The tablet/desktop rail replaces this disclosure at 768px. If the user
  // rotates or resizes back to mobile, do not resurrect a stale open panel.
  useEffect(() => {
    const wideWebsite = window.matchMedia("(min-width: 768px)");
    const closeForWideWebsite = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    if (wideWebsite.matches) setOpen(false);
    wideWebsite.addEventListener("change", closeForWideWebsite);
    return () => wideWebsite.removeEventListener("change", closeForWideWebsite);
  }, []);

  // Inline browser menus should also dismiss when the user taps elsewhere,
  // without stealing focus or swallowing the outside pointer interaction.
  useEffect(() => {
    if (!open) return;

    const onOutsidePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !navigationRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", onOutsidePointerDown);
  }, [open]);

  // Activating a disclosure link with Enter closes its panel. Keep keyboard
  // focus on the still-visible trigger instead of stranding it on a hidden
  // link; pointer navigation must never steal focus.
  const closeAfterNavigation = (keyboardActivated: boolean, targetPath: string) => {
    setOpen(false);
    if (!keyboardActivated) return;
    pendingKeyboardSectionFocus =
      pathname !== targetPath ? { path: targetPath, at: Date.now() } : null;
    // Retain a visible focus location until navigation completes.
    triggerRef.current?.focus();
  };

  if (!hasLocalNavigation(area)) return null;
  // Entity pages already have a breadcrumb and global Explore navigation.
  if (/^\/(?:countries|editions|shows|wiki)\/[^/]+/.test(pathname)) return null;

  const items = publicDestinationsForArea(area, { includeContextual: false });
  const active = items
    .filter((item) => publicPathMatches(pathname, item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];

  const primary = items.filter((item) => item.visibility === "primary");
  const secondary = items.filter((item) => item.visibility === "secondary");
  const advanced = items.filter((item) => item.visibility === "advanced");

  return (
    <nav
      ref={navigationRef}
      className="public-mobile-section-nav"
      aria-label={sectionLabel(area) + " navigation"}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="public-mobile-section-trigger"
        aria-expanded={open}
        aria-controls={"public-mobile-section-panel-" + area}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0 text-left">
          <span className="block text-[10px] font-black uppercase tracking-[.13em] text-primary">
            {sectionLabel(area)}
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold">
            {active?.label ?? "Browse this section"}
          </span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      <div
        id={"public-mobile-section-panel-" + area}
        className="public-mobile-section-panel"
        hidden={!open}
      >
        <MobileGroup area={area} items={primary} activeTo={active?.to} onNavigate={closeAfterNavigation} />
        {secondary.length ? (
          <MobileGroup
            area={area}
            label="More"
            items={secondary}
            activeTo={active?.to}
            onNavigate={closeAfterNavigation}
          />
        ) : null}
        {advanced.length ? (
          <MobileGroup
            area={area}
            label={area === "results" ? "More result tools" : "Advanced"}
            items={advanced}
            activeTo={active?.to}
            onNavigate={closeAfterNavigation}
          />
        ) : null}

        <div className="border-t border-border/60 pt-2">
          <Link
            to="/site-directory"
            className="public-mobile-section-link"
            onClick={(event) => {
              trackPublicUxEvent("section_nav_clicked", {
                target: "/site-directory",
                metadata: { area, visibility: "directory", source: "mobile_section" },
              });
              closeAfterNavigation(event.detail === 0, "/site-directory");
            }}
          >
            All Solaris pages
          </Link>
        </div>
      </div>
    </nav>
  );
}

function MobileGroup({
  area,
  label,
  items,
  activeTo,
  onNavigate,
}: {
  area: PublicArea;
  label?: string;
  items: ReturnType<typeof publicDestinationsForArea>;
  activeTo?: string;
  onNavigate: (keyboardActivated: boolean, targetPath: string) => void;
}) {
  return (
    <div className="space-y-1">
      {label ? (
        <p className="px-2 pt-1 text-[9px] font-black uppercase tracking-[.12em] text-muted-foreground">
          {label}
        </p>
      ) : null}
      {items.map((item) => (
        <Link
          key={item.id}
          to={item.to as any}
          aria-current={item.to === activeTo ? "page" : undefined}
          onClick={(event) => {
            trackPublicUxEvent("section_nav_clicked", {
              target: item.to,
              metadata: {
                area,
                visibility: item.visibility,
                source: "mobile_section",
              },
            });
            onNavigate(event.detail === 0, item.to);
          }}
          className={cn(
            "public-mobile-section-link",
            item.to === activeTo && "is-active",
          )}
        >
          <span className="font-semibold">{item.label}</span>
          <span className="text-[11px] leading-4 text-muted-foreground">
            {item.description}
          </span>
        </Link>
      ))}
    </div>
  );
}

function hasLocalNavigation(area: PublicArea) {
  return area === "explore" || area === "participate" || area === "results" || area === "help";
}

function sectionLabel(area: PublicArea) {
  switch (area) {
    case "explore":
      return "Explore";
    case "participate":
      return "Participate";
    case "results":
      return "Results";
    case "help":
      return "Rules & help";
    default:
      return "Solaris Studio";
  }
}

import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import {
  publicAreaForPath,
  publicDestinationsForArea,
  publicPathMatches,
  type PublicArea,
} from "@/lib/public-navigation";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import { cn } from "@/lib/utils";

export function PublicMobileSectionNav({ pathname }: { pathname: string }) {
  const area = publicAreaForPath(pathname);
  const [open, setOpen] = useState(false);

  if (!hasLocalNavigation(area)) return null;

  const items = publicDestinationsForArea(area, { includeContextual: false });
  const active = items
    .filter((item) => publicPathMatches(pathname, item.to))
    .sort((a, b) => b.to.length - a.to.length)[0];

  const primary = items.filter((item) => item.visibility === "primary");
  const secondary = items.filter((item) => item.visibility === "secondary");
  const advanced = items.filter((item) => item.visibility === "advanced");

  return (
    <section className="public-mobile-section-nav" aria-label={sectionLabel(area) + " navigation"}>
      <button
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

      {open ? (
        <div id={"public-mobile-section-panel-" + area} className="public-mobile-section-panel">
          <MobileGroup area={area} items={primary} activeTo={active?.to} onNavigate={() => setOpen(false)} />
          {secondary.length ? (
            <MobileGroup
              area={area}
              label="More"
              items={secondary}
              activeTo={active?.to}
              onNavigate={() => setOpen(false)}
            />
          ) : null}
          {advanced.length ? (
            <MobileGroup
              area={area}
              label={area === "results" ? "More result tools" : "Advanced"}
              items={advanced}
              activeTo={active?.to}
              onNavigate={() => setOpen(false)}
            />
          ) : null}

          <div className="border-t border-border/60 pt-2">
            <Link
              to="/site-directory"
              className="public-mobile-section-link"
              onClick={() => {
                trackPublicUxEvent("section_nav_clicked", {
                  target: "/site-directory",
                  metadata: { area, visibility: "directory", source: "mobile_section" },
                });
                setOpen(false);
              }}
            >
              All Solaris pages
            </Link>
          </div>
        </div>
      ) : null}
    </section>
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
  onNavigate: () => void;
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
          onClick={() => {
            trackPublicUxEvent("section_nav_clicked", {
              target: item.to,
              metadata: {
                area,
                visibility: item.visibility,
                source: "mobile_section",
              },
            });
            onNavigate();
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

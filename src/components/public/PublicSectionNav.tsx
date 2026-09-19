import { Link } from "@tanstack/react-router";
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";

import {
  publicAreaForPath,
  publicDestinationsForArea,
  publicPathMatches,
  type PublicArea,
  type PublicDestination,
} from "@/lib/public-navigation";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import { cn } from "@/lib/utils";

export function PublicSectionNav({
  pathname,
  collapsible = false,
}: {
  pathname: string;
  collapsible?: boolean;
}) {
  const area = publicAreaForPath(pathname);
  const [hydrated, setHydrated] = useState(false);
  const [collapsed, setCollapsed] = useState(collapsible);

  useEffect(() => setHydrated(true), []);

  if (!hasLocalNavigation(area)) return null;

  const interactiveCollapsed = hydrated && collapsible && collapsed;

  const items = publicDestinationsForArea(area, { includeContextual: false });
  const primary = items.filter((item) => item.visibility === "primary");
  const secondary = items.filter((item) => item.visibility === "secondary");
  const advanced = items.filter((item) => item.visibility === "advanced");

  const activeTo = items
    .filter((item) => publicPathMatches(pathname, item.to))
    .sort((a, b) => b.to.length - a.to.length)[0]?.to;

  return (
    <aside
      className={cn(
        "public-site-sidebar public-section-navigation",
        collapsible && "is-collapsible",
        interactiveCollapsed && "is-collapsed",
      )}
      aria-label={`${sectionLabel(area)} navigation`}
    >
      {collapsible && hydrated ? (
        <button
          type="button"
          className="public-section-nav-toggle"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!interactiveCollapsed}
          aria-label={interactiveCollapsed ? `Expand ${sectionLabel(area)} navigation` : `Collapse ${sectionLabel(area)} navigation`}
          title={interactiveCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          {interactiveCollapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden="true" />
          )}
          <span>{interactiveCollapsed ? sectionLabel(area) : "Collapse"}</span>
        </button>
      ) : null}

      <nav className="public-section-nav-body">
        <div className="px-2">
          <p className="public-site-sidebar-label">{sectionLabel(area)}</p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground/70">
            {sectionDescription(area)}
          </p>
        </div>

        <div className="mt-3 space-y-0.5">
          {primary.map((item) => (
            <SectionLink key={item.id} item={item} active={item.to === activeTo} area={area} />
          ))}
        </div>

        {secondary.length ? (
          <div className="mt-4 border-t border-border/55 pt-3">
            <p className="px-2 text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
              More
            </p>
            <div className="mt-1 space-y-0.5">
              {secondary.map((item) => (
                <SectionLink key={item.id} item={item} active={item.to === activeTo} area={area} />
              ))}
            </div>
          </div>
        ) : null}

        {advanced.length ? (
          <details className="group mt-4 border-t border-border/55 pt-3">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-surface/70 hover:text-foreground [&::-webkit-details-marker]:hidden">
              <span>{area === "results" ? "More result tools" : "Advanced"}</span>
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="mt-1 space-y-0.5">
              {advanced.map((item) => (
                <SectionLink key={item.id} item={item} active={item.to === activeTo} area={area} />
              ))}
            </div>
          </details>
        ) : null}

        <div className="mt-4 border-t border-border/55 pt-3">
          <Link
            to="/site-directory"
            onClick={() =>
              trackPublicUxEvent("section_nav_clicked", {
                target: "/site-directory",
                metadata: { area, visibility: "directory" },
              })
            }
            className="public-site-sidebar-link"
          >
            All Solaris pages
          </Link>
        </div>
      </nav>
    </aside>
  );
}

function SectionLink({
  item,
  active,
  area,
}: {
  item: PublicDestination;
  active: boolean;
  area: PublicArea;
}) {
  return (
    <Link
      to={item.to as any}
      aria-current={active ? "page" : undefined}
      title={item.description}
      onClick={() =>
        trackPublicUxEvent("section_nav_clicked", {
          target: item.to,
          metadata: { area, visibility: item.visibility },
        })
      }
      className={cn("public-site-sidebar-link", active && "is-active")}
    >
      {item.label}
    </Link>
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

function sectionDescription(area: PublicArea) {
  switch (area) {
    case "explore":
      return "Browse the contest from general history to specific editions and countries.";
    case "participate":
      return "Participation services for the current contest.";
    case "results":
      return "Published results, analysis and optional result tools.";
    case "help":
      return "Rules, guidance and Trust & Integrity.";
    default:
      return "";
  }
}

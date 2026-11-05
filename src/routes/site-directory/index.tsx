import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { AppEmptyState, AppGroupedList, AppScreen, AppSectionHeader } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import {
  filterSiteDirectory,
  siteDirectoryAreaCounts,
  siteDirectoryDestinations,
  SITE_DIRECTORY_AREA_LABELS,
  SITE_DIRECTORY_AREA_ORDER,
  type SiteDirectoryArea,
} from "@/lib/v3-site-directory";
import type { PublicArea, PublicDestination } from "@/lib/public-navigation";
import "@/styles/v3-directory-family.css";

export const Route = createFileRoute("/site-directory/")({
  head: () => ({
    meta: [
      { title: "All Solaris pages — Solaris Studio" },
      {
        name: "description",
        content: "Search and browse every public Solaris Studio destination.",
      },
    ],
  }),
  component: SiteDirectoryPage,
});

function SiteDirectoryPage() {
  const { platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<SiteDirectoryArea>("all");

  const destinations = useMemo(siteDirectoryDestinations, []);
  const searchMatches = useMemo(
    () => filterSiteDirectory(destinations, query),
    [destinations, query],
  );
  const matches = useMemo(
    () => filterSiteDirectory(searchMatches, "", area),
    [searchMatches, area],
  );
  const areas = useMemo(() => siteDirectoryAreaCounts(searchMatches), [searchMatches]);
  const reset = () => { setArea("all"); setQuery(""); };

  // App identity must be resolved before rendering browser-only navigation.
  if (!platformResolved) {
    return <div data-directory-boot="" role="status" aria-label="Opening Solaris directory" className="min-h-20" />;
  }

  return (
    <AppShell>
      <div className="v3-directory-family" data-directory-experience={presentation}>
        {presentation === "installed-app" ? (
          <AppScreen>
            <header className="v3-directory-app-heading">
              <p className="v3-directory-eyebrow">EXPLORE SOLARIS</p>
              <h1>All Solaris pages</h1>
              <p>Every destination in one place, from countries and shows to your tools.</p>
            </header>
            <div className="v3-directory-controls">
              <SolarisSearchField
                value={query}
                onChange={setQuery}
                label="Search Solaris Studio pages"
                placeholder="Search pages or tools…"
              />
              <Sheet>
                <SheetTrigger asChild>
                  <button type="button" className="v3-directory-sheet-trigger" aria-label="Filter pages by area">
                    <SlidersHorizontal size={18} aria-hidden="true" />
                    <span>{area === "all" ? "All areas" : SITE_DIRECTORY_AREA_LABELS[area]}</span>
                    <span className="v3-directory-count">{matches.length}</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" aria-label="Filter pages by area" className="max-h-[80dvh] overflow-y-auto">
                  <h2 className="mb-3 text-lg font-bold">Browse by area</h2>
                  <div className="v3-directory-sheet-options">
                    <SheetClose asChild>
                      <button type="button" aria-pressed={area === "all"} onClick={() => setArea("all")}>
                        All areas <span>{searchMatches.length}</span>
                      </button>
                    </SheetClose>
                    {areas.map((item) => (
                      <SheetClose asChild key={item.area}>
                        <button type="button" aria-pressed={area === item.area} onClick={() => setArea(item.area)}>
                          {item.label} <span>{item.count}</span>
                        </button>
                      </SheetClose>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <p className="v3-directory-results-count" role="status">{matches.length} matching pages</p>
            <DirectoryGroups items={matches} presentation={presentation} />
            {!matches.length ? <DirectoryEmpty onReset={reset} /> : null}
          </AppScreen>
        ) : (
          <>
            {presentation === "mobile-web" ? (
              <header className="v3-directory-mobile-header" data-directory-mobile-header="">
                <Link to="/explore" className="v3-directory-back">Explore / All pages</Link>
                <p className="v3-directory-eyebrow">FIND YOUR WAY</p>
                <h1>All Solaris pages</h1>
                <p>Browse Solaris by topic or search for a page, tool or feature.</p>
              </header>
            ) : (
              <PageHeader
                eyebrow="Find your way"
                title="All Solaris pages"
                description="Browse every public Solaris destination, including advanced tools and older feature names."
              />
            )}
            <div className="v3-directory-workspace">
              {presentation === "desktop-web" ? (
                <aside className="v3-directory-desktop-rail" aria-label="Filter directory by area">
                  <h2>Browse by area</h2>
                  <button type="button" aria-pressed={area === "all"} onClick={() => setArea("all")}>
                    <span>All areas</span><span>{searchMatches.length}</span>
                  </button>
                  {areas.map((item) => (
                    <button type="button" key={item.area} aria-pressed={area === item.area}
                      onClick={() => setArea(item.area)}>
                      <span>{item.label}</span><span>{item.count}</span>
                    </button>
                  ))}
                </aside>
              ) : null}
              <div className="v3-directory-results">
                <div className="v3-directory-controls">
                  <label className="v3-directory-search">
                    <Search size={18} aria-hidden="true" />
                    <span className="sr-only">Search Solaris Studio pages</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search pages, tools or old feature names…"
                      aria-label="Search Solaris Studio pages"
                      autoComplete="off"
                    />
                  </label>
                  {presentation === "mobile-web" ? (
                    <label className="v3-directory-area-select">
                      <span className="sr-only">Browse pages by area</span>
                      <select aria-label="Browse pages by area" value={area}
                        onChange={(event) => setArea(event.target.value as SiteDirectoryArea)}>
                        <option value="all">All areas ({searchMatches.length})</option>
                        {areas.map((item) => (
                          <option key={item.area} value={item.area}>{item.label} ({item.count})</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <p className="v3-directory-results-count" role="status">{matches.length} matching pages</p>
                <DirectoryGroups items={matches} presentation={presentation} />
                {!matches.length ? <DirectoryEmpty onReset={reset} /> : null}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function DirectoryGroups({
  items,
  presentation,
}: {
  items: readonly PublicDestination[];
  presentation: V3DirectoryPresentation;
}) {
  return (
    <div className="v3-directory-groups">
      {SITE_DIRECTORY_AREA_ORDER.map((area: PublicArea) => {
        const group = items.filter((item) => item.area === area);
        if (!group.length) return null;
        const headingId = `directory-${area}`;
        return (
          <section key={area} aria-labelledby={headingId} className="v3-directory-group">
            {presentation === "installed-app" ? (
              <AppSectionHeader eyebrow="Browse" title={SITE_DIRECTORY_AREA_LABELS[area]} id={headingId} />
            ) : (
              <h2 id={headingId} className="v3-directory-group-title">{SITE_DIRECTORY_AREA_LABELS[area]}</h2>
            )}
            {presentation === "installed-app" ? (
              <AppGroupedList>
                {group.map((item) => (
                  <Link key={item.id} to={item.to as any} className="solaris-app-list-row">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{item.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))}
              </AppGroupedList>
            ) : presentation === "mobile-web" ? (
              <div className="v3-directory-mobile-list">
                {group.map((item) => (
                  <Link key={item.id} to={item.to as any} className="v3-directory-mobile-row">
                    <span className="min-w-0 flex-1">
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </span>
                    <ChevronRight size={19} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="v3-directory-desktop-grid">
                {group.map((item) => (
                  <Link key={item.id} to={item.to as any} className="v3-directory-desktop-card">
                    <span className="v3-directory-card-top">
                      <strong>{item.label}</strong>
                      <ChevronRight size={19} aria-hidden="true" />
                    </span>
                    <span className="v3-directory-card-description">{item.description}</span>
                    {item.aliases?.length ? (
                      <span className="v3-directory-aliases">Also known as {item.aliases.join(", ")}</span>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DirectoryEmpty({ onReset }: { onReset: () => void }) {
  return (
    <AppEmptyState
      title="No matching pages"
      description="Try another page, feature or area. All available destinations remain searchable."
      action={
        <button type="button" onClick={onReset} className="solaris-app-empty-action">
          Clear filters
        </button>
      }
    />
  );
}

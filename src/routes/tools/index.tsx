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
  PUBLIC_TOOL_GROUPS,
  filterPublicToolGroups,
  countPublicTools,
  type PublicTool,
  type PublicToolArea,
  type PublicToolGroup,
} from "@/lib/v3-tool-directory";
import "@/styles/v3-directory-family.css";

export const Route = createFileRoute("/tools/")({
  head: () => ({
    meta: [
      { title: "Tools — Solaris Studio" },
      { name: "description", content: "Browse Solaris scorecharts, predictions, result simulations and historical tools." },
    ],
  }),
  component: ToolsPage,
});

function ToolsPage() {
  const { platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<PublicToolArea>("all");

  const searchable = useMemo(
    () => filterPublicToolGroups(PUBLIC_TOOL_GROUPS, query),
    [query],
  );
  const groups = useMemo(
    () => filterPublicToolGroups(searchable, "", area),
    [searchable, area],
  );
  const visible = countPublicTools(groups);
  const totalMatching = countPublicTools(searchable);
  const areas = PUBLIC_TOOL_GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    count: searchable.find((entry) => entry.id === group.id)?.tools.length ?? 0,
  }));
  const label = area === "all" ? "All categories" : PUBLIC_TOOL_GROUPS.find((group) => group.id === area)?.title ?? "All categories";
  const reset = () => { setArea("all"); setQuery(""); };

  if (!platformResolved) {
    return <div data-directory-boot="" role="status" aria-label="Opening Solaris tools" className="min-h-20" />;
  }

  return (
    <AppShell>
      <div className="v3-directory-family" data-directory-experience={presentation}>
        {presentation === "installed-app" ? (
          <AppScreen>
            <header className="v3-directory-app-heading">
              <p className="v3-directory-eyebrow">EXPLORE SOLARIS</p>
              <h1>Tools</h1>
              <p>Explore results, follow the contest and revisit the archive.</p>
            </header>
            <div className="v3-directory-controls">
              <SolarisSearchField
                value={query}
                onChange={setQuery}
                label="Search Solaris tools"
                placeholder="Search tools or topics…"
              />
              <Sheet>
                <SheetTrigger asChild>
                  <button type="button" className="v3-directory-sheet-trigger" aria-label="Filter tools by category">
                    <SlidersHorizontal size={18} aria-hidden="true" />
                    <span>{label}</span>
                    <span className="v3-directory-count">{visible}</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" aria-label="Filter tools by category" className="max-h-[80dvh] overflow-y-auto">
                  <h2 className="mb-3 text-lg font-bold">Browse by category</h2>
                  <div className="v3-directory-sheet-options">
                    <SheetClose asChild>
                      <button type="button" aria-pressed={area === "all"} onClick={() => setArea("all")}>
                        All categories <span>{totalMatching}</span>
                      </button>
                    </SheetClose>
                    {areas.map((item) => (
                      <SheetClose key={item.id} asChild>
                        <button type="button" aria-pressed={area === item.id} onClick={() => setArea(item.id)}>
                          {item.title} <span>{item.count}</span>
                        </button>
                      </SheetClose>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <p className="v3-directory-results-count" role="status">{visible} matching tools</p>
            <ToolsGroups groups={groups} presentation={presentation} />
            {!visible ? <ToolsEmpty onReset={reset} /> : null}
          </AppScreen>
        ) : (
          <>
            {presentation === "mobile-web" ? (
              <header className="v3-directory-mobile-header" data-directory-mobile-header="">
                <Link to="/explore" className="v3-directory-back">Explore / Tools</Link>
                <p className="v3-directory-eyebrow">SOLARIS TOOLKIT</p>
                <h1>Tools</h1>
                <p>Find the right way to explore results, predictions or history.</p>
              </header>
            ) : (
              <PageHeader
                eyebrow="Explore Solaris"
                title="Tools"
                description="Scorecharts, predictions, result tests, comparisons and archive tools in one searchable collection."
              />
            )}
            <div className="v3-directory-workspace">
              {presentation === "desktop-web" ? (
                <aside className="v3-directory-desktop-rail" aria-label="Filter tools by category">
                  <h2>Browse tools</h2>
                  <button type="button" aria-pressed={area === "all"} onClick={() => setArea("all")}>
                    <span>All categories</span><span>{totalMatching}</span>
                  </button>
                  {areas.map((item) => (
                    <button key={item.id} type="button" aria-pressed={area === item.id}
                      onClick={() => setArea(item.id)}>
                      <span>{item.title}</span><span>{item.count}</span>
                    </button>
                  ))}
                </aside>
              ) : null}
              <div className="v3-directory-results">
                <div className="v3-directory-controls">
                  <label className="v3-directory-search">
                    <Search size={18} aria-hidden="true" />
                    <span className="sr-only">Search Solaris tools</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search tools and topics…"
                      aria-label="Search Solaris tools"
                      autoComplete="off"
                    />
                  </label>
                  {presentation === "mobile-web" ? (
                    <label className="v3-directory-area-select">
                      <span className="sr-only">Browse tools by category</span>
                      <select value={area} aria-label="Browse tools by category"
                        onChange={(event) => setArea(event.target.value as PublicToolArea)}>
                        <option value="all">All categories ({totalMatching})</option>
                        {areas.map((item) => (
                          <option value={item.id} key={item.id}>{item.title} ({item.count})</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
                <p className="v3-directory-results-count" role="status">{visible} matching tools</p>
                <ToolsGroups groups={groups} presentation={presentation} />
                {!visible ? <ToolsEmpty onReset={reset} /> : null}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ToolsGroups({
  groups,
  presentation,
}: {
  groups: readonly PublicToolGroup[];
  presentation: V3DirectoryPresentation;
}) {
  return (
    <div className="v3-directory-groups">
      {groups.map((group) => {
        const headingId = `tools-${group.id}`;
        return (
          <section className="v3-directory-group" key={group.id} aria-labelledby={headingId}>
            {presentation === "installed-app" ? (
              <>
                <AppSectionHeader eyebrow="Browse" title={group.title} id={headingId} />
                <p className="v3-directory-group-description">{group.description}</p>
              </>
            ) : (
              <>
                <h2 id={headingId} className="v3-directory-group-title">{group.title}</h2>
                <p className="v3-directory-group-description">{group.description}</p>
              </>
            )}
            {presentation === "installed-app" ? (
              <AppGroupedList>
                {group.tools.map((tool) => (
                  <Link key={tool.to} to={tool.to as any} className="solaris-app-list-row">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">{tool.title}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{tool.description}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))}
              </AppGroupedList>
            ) : presentation === "mobile-web" ? (
              <div className="v3-directory-mobile-list">
                {group.tools.map((tool) => <ToolMobileRow key={tool.to} tool={tool} />)}
              </div>
            ) : (
              <div className="v3-directory-desktop-grid">
                {group.tools.map((tool) => (
                  <Link key={tool.to} to={tool.to as any} className="v3-directory-desktop-card">
                    <span className="v3-directory-eyebrow">{tool.eyebrow}</span>
                    <span className="v3-directory-card-top">
                      <strong>{tool.title}</strong>
                      <ChevronRight size={19} aria-hidden="true" />
                    </span>
                    <span className="v3-directory-card-description">{tool.description}</span>
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

function ToolMobileRow({ tool }: { tool: PublicTool }) {
  return (
    <Link to={tool.to as any} className="v3-directory-mobile-row">
      <span className="min-w-0 flex-1">
        <strong>{tool.title}</strong>
        <span>{tool.description}</span>
      </span>
      <ChevronRight size={19} aria-hidden="true" />
    </Link>
  );
}

function ToolsEmpty({ onReset }: { onReset: () => void }) {
  return (
    <AppEmptyState
      title="No matching tools"
      description="Try a different tool name or category."
      action={<button type="button" onClick={onReset} className="solaris-app-empty-action">Clear filters</button>}
    />
  );
}

import { usePublicLaunchAvailability } from "@/lib/public-launch-context";
import { Link } from "@tanstack/react-router";
import { BarChart3, CalendarDays, Check, ChevronRight, History, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { AppEmptyState, AppGroupedList, AppScreen } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import { directoryCountLabel, resolveDirectoryScope } from "@/lib/v3-directory-count";
import { matchesPublicDirectorySearch } from "@/lib/v3-public-directory-search";
import { MAX_PUBLIC_DIRECTORY_QUERY_LENGTH, normalizePublicDirectoryUrlQuery, type PublicDirectoryUrlSearch } from "@/lib/v3-directory-url-search";
import "@/styles/v3-directory-family.css";

export type V3DirectoryItem = {
  id: string;
  title: string;
  description: string;
  to: string;
  /** Typed parameters for official chapter and other directory deep links. */
  params?: Record<string, string>;
  searchText?: string;
  eyebrow?: string;
  aliases?: readonly string[];
};

export type V3DirectoryGroup = {
  id: string;
  label: string;
  /** Optional context for purpose-built historical and specialist directories. */
  description?: string;
  items: readonly V3DirectoryItem[];
};

export function V3DirectoryFamilyIndex({
  variant = "sitemap",
  title,
  eyebrow,
  intro,
  browserIntro,
  searchLabel,
  searchPlaceholder,
  scopeLabel,
  emptyText,
  itemNoun,
  groups,
  context,
  noShell = false,
  visualClassName,
  urlSearch,
  onUrlSearchChange,
}: {
  variant?: "tools" | "sitemap" | "archive";
  title: string;
  eyebrow: string;
  intro: string;
  browserIntro: string;
  searchLabel: string;
  searchPlaceholder: string;
  scopeLabel: string;
  emptyText: string;
  itemNoun: string;
  groups: readonly V3DirectoryGroup[];
  context?: ReactNode;
  /** Rules owns its own governed rollout shell. */
  noShell?: boolean;
  /** Browser-only editorial class; preserves the visual design of #2602. */
  visualClassName?: string;
  /** Optional validated permalink state, supplied by the owning route. */
  urlSearch?: PublicDirectoryUrlSearch;
  onUrlSearchChange?: (search: PublicDirectoryUrlSearch) => void;
}) {
  const { allowsReleased: allows } = usePublicLaunchAvailability();
  groups = groups.map(group => ({ ...group, items: group.items.filter(item => allows(item.to)) }))
    .filter(group => group.items.length > 0);
  const { platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();
  const [search, setSearch] = useState(urlSearch?.q ?? "");
  const [area, setArea] = useState(urlSearch?.area ?? "all");
  const changeSearch = (value: string) =>
    setSearch(value.slice(0, MAX_PUBLIC_DIRECTORY_QUERY_LENGTH));
  const effectiveArea = resolveDirectoryScope(area, groups);
  // Restore browser back/forward navigation; never use URL filters as access control.
  useEffect(() => setSearch(urlSearch?.q ?? ""), [urlSearch?.q]);
  useEffect(() => setArea(urlSearch?.area ?? "all"), [urlSearch?.area]);
  useEffect(() => {
    if (!platformResolved || !urlSearch || !onUrlSearchChange) return;
    const q = normalizePublicDirectoryUrlQuery(search);
    const selectedArea = effectiveArea === "all" ? undefined : effectiveArea;
    if (q === urlSearch.q && selectedArea === urlSearch.area) return;
    // Replace typing history rather than adding a history entry per keystroke.
    const timer = window.setTimeout(
      () => onUrlSearchChange({ q, area: selectedArea }), 250,
    );
    return () => window.clearTimeout(timer);
  }, [platformResolved, search, effectiveArea, urlSearch?.q, urlSearch?.area, onUrlSearchChange]);
  // Revoked/unpublished category choices must not silently come back later.
  useEffect(() => {
    if (effectiveArea !== area) setArea("all");
  }, [area, effectiveArea]);

  const searched = useMemo(() => groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => matchesPublicDirectorySearch(search, [
      group.label,
      group.description,
      item.title,
      item.description,
      item.eyebrow,
      ...(item.aliases ?? []),
      item.searchText,
    ])),
  })), [groups, search]);
  const total = groups.reduce((sum, group) => sum + group.items.length, 0);
  const searchMatches = searched.reduce((sum, group) => sum + group.items.length, 0);
  const scoped = searched.filter((group) => effectiveArea === "all" || effectiveArea === group.id);
  const visible = scoped.reduce((sum, group) => sum + group.items.length, 0);
  const options = [
    { id: "all", label: scopeLabel, count: searchMatches },
    ...searched.map((group) => ({
      id: group.id, label: group.label, count: group.items.length,
    })),
  ];
  const selected = options.find((entry) => entry.id === effectiveArea) ?? options[0];
  const resultCount = directoryCountLabel({ available: total, matches: visible, rendered: visible, noun: itemNoun });
  const reset = () => { setSearch(""); setArea("all"); };

  if (!platformResolved) {
    return <div data-directory-boot="" role="status" aria-label={`Opening ${title}`} className="min-h-20" />;
  }

  const searchField = presentation === "installed-app" ? (
    <SolarisSearchField value={search} onChange={changeSearch} label={searchLabel} placeholder={searchPlaceholder} />
  ) : (
    <div className="v3-directory-search" role="search">
      <Search size={18} aria-hidden="true" />
      <input type="search" className="solaris-app-search-input" value={search} aria-label={searchLabel}
        onChange={(event) => changeSearch(event.target.value)} placeholder={searchPlaceholder} autoComplete="off" />
      {search ? (
        <button type="button" className="v3-directory-search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );

  const scopeControl = presentation === "installed-app" ? (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" className="v3-directory-sheet-trigger" aria-label={`Filter ${itemNoun} by category`}>
          <SlidersHorizontal size={18} aria-hidden="true" />
          <span>{selected.label}</span>
          <span className="v3-directory-count">{visible}</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" aria-label={`Filter ${itemNoun} by category`} className="max-h-[80dvh] overflow-y-auto">
        <h2 className="mb-3 text-lg font-bold">Browse by category</h2>
        <div className="v3-directory-sheet-options">
          {options.map((option) => (
            <SheetClose key={option.id} asChild>
              <button type="button" aria-pressed={effectiveArea === option.id} onClick={() => setArea(option.id)}>
                <span className="v3-directory-option-label">{effectiveArea === option.id ? <Check size={17} aria-hidden="true" /> : null}{option.label}</span>
                <span>{option.count}</span>
              </button>
            </SheetClose>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  ) : presentation === "mobile-web" ? (
    <label className="v3-directory-area-select">
      <span className="sr-only">{`Browse ${itemNoun} by category`}</span>
      <select aria-label={`Browse ${itemNoun} by category`} value={effectiveArea}
        onChange={(event) => setArea(event.target.value)}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label} ({option.count})</option>)}
      </select>
    </label>
  ) : null;

  const contents = (
    <>
      <div className="v3-directory-controls">{searchField}{scopeControl}</div>
      <p className="v3-directory-results-count" role="status" aria-live="polite">{resultCount}</p>
      {visible > 0 && (search.trim() || effectiveArea !== "all") ? (
        <button type="button" className="v3-directory-clear-filters" onClick={reset}>Clear filters</button>
      ) : null}
      <div className="v3-directory-groups">
        {scoped.filter((group) => group.items.length > 0).map((group) => (
          <section key={group.id} className="v3-directory-group" aria-labelledby={`directory-${group.id}`}>
            <h2 id={`directory-${group.id}`} className="v3-directory-group-title">
              {group.label}<span className="v3-directory-group-count">{group.items.length}</span>
            </h2>
            {group.description ? <p className="v3-directory-group-description">{group.description}</p> : null}
            <DirectoryItems items={group.items} presentation={presentation} variant={variant} groupId={group.id} />
          </section>
        ))}
      </div>
      {!visible ? total === 0 ? (
        <AppEmptyState
          title={`No public ${itemNoun} available`}
          description="No destinations in this collection are currently available in the public release."
        />
      ) : (
        <AppEmptyState
          title={`No matching ${itemNoun}`}
          description={emptyText}
          action={<button type="button" className="solaris-app-empty-action" onClick={reset}>Clear filters</button>}
        />
      ) : null}
    </>
  );

  const content = (
      <div className={`v3-directory-family v3-editorial-directory${visualClassName ? ` ${visualClassName}` : ""}`} data-directory-experience={presentation} data-directory-kind={variant}>
        {presentation === "installed-app" ? (
          <AppScreen>
            <header className="v3-directory-app-heading">
              <p className="v3-directory-eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              <p>{intro}</p>
            </header>
            {context}
            {contents}
          </AppScreen>
        ) : (
          <>
            {presentation === "mobile-web" ? (
              <header className="v3-directory-mobile-header" data-directory-mobile-header="">
                <p className="v3-directory-eyebrow">{eyebrow}</p>
                <h1>{title}</h1>
                <p>{browserIntro}</p>
              </header>
            ) : <PageHeader eyebrow={eyebrow} title={title} description={intro} />}
            {context}
            <div className="v3-directory-workspace">
              {presentation === "desktop-web" ? (
                <aside className="v3-directory-desktop-rail" aria-label={`Filter ${itemNoun} by category`}>
                  <h2>Browse by category</h2>
                  {options.map((option) => (
                    <button key={option.id} type="button" aria-pressed={effectiveArea === option.id}
                      onClick={() => setArea(option.id)}>
                      <span>{option.label}</span><span>{option.count}</span>
                    </button>
                  ))}
                </aside>
              ) : null}
              <div className="v3-directory-results">{contents}</div>
            </div>
          </>
        )}
      </div>
  );
  return noShell ? content : <AppShell>{content}</AppShell>;
}

function DirectoryItems({ items, presentation, variant, groupId }: {
  items: readonly V3DirectoryItem[];
  presentation: V3DirectoryPresentation;
  variant: "tools" | "sitemap" | "archive";
  groupId: string;
}) {
  const ToolIcon = groupId === "results" ? BarChart3 : groupId === "archive" ? History : CalendarDays;
  if (presentation === "installed-app") {
    return <AppGroupedList>
      {items.map((item) => (
        <Link key={item.id} to={item.to as any} params={item.params as any} className="solaris-app-list-row">
          {variant === "tools" ? <span className="v3-directory-tool-icon"><ToolIcon size={18} aria-hidden="true" /></span> : null}
          <span className="min-w-0 flex-1">
            <strong className="block text-sm font-semibold">{item.title}</strong>
            <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{item.description}</span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      ))}
    </AppGroupedList>;
  }
  if (presentation === "mobile-web") {
    return <div className="v3-directory-mobile-list">
      {items.map((item) => (
        <Link key={item.id} to={item.to as any} params={item.params as any} className="v3-directory-mobile-row">
          {variant === "tools" ? <span className="v3-directory-tool-icon"><ToolIcon size={18} aria-hidden="true" /></span> : null}
          <span className="min-w-0 flex-1"><strong>{item.title}</strong><span>{item.description}</span></span>
          <ChevronRight size={19} aria-hidden="true" />
        </Link>
      ))}
    </div>;
  }
  return <div className="v3-directory-desktop-grid">
    {items.map((item) => (
      <Link key={item.id} to={item.to as any} params={item.params as any} className="v3-directory-desktop-card">
        {variant === "tools" ? <span className="v3-directory-tool-icon"><ToolIcon size={18} aria-hidden="true" /></span> : null}
        {item.eyebrow ? <span className="v3-directory-eyebrow">{item.eyebrow}</span> : null}
        <span className="v3-directory-card-top"><strong>{item.title}</strong><ChevronRight size={19} aria-hidden="true" /></span>
        <span className="v3-directory-card-description">{item.description}</span>
        {item.aliases?.length ? <span className="v3-directory-aliases">Also known as {item.aliases.join(", ")}</span> : null}
      </Link>
    ))}
  </div>;
}

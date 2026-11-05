import { Link } from "@tanstack/react-router";
import { ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { AppEmptyState, AppGroupedList, AppScreen, AppSectionHeader } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import "@/styles/v3-directory-family.css";

export type V3DirectoryItem = {
  id: string;
  title: string;
  description: string;
  to: string;
  searchText?: string;
  eyebrow?: string;
  aliases?: readonly string[];
};

export type V3DirectoryGroup = {
  id: string;
  label: string;
  items: readonly V3DirectoryItem[];
};

export function V3DirectoryFamilyIndex({
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
}: {
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
}) {
  const { platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();
  const [search, setSearch] = useState("");
  const [area, setArea] = useState("all");

  const searched = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const text = [item.title, item.description, item.eyebrow,
          ...(item.aliases ?? []), item.searchText].filter(Boolean).join(" ").toLowerCase();
        return terms.every((term) => text.includes(term));
      }),
    }));
  }, [groups, search]);
  const total = searched.reduce((sum, group) => sum + group.items.length, 0);
  const scoped = searched.filter((group) => area === "all" || area === group.id);
  const visible = scoped.reduce((sum, group) => sum + group.items.length, 0);
  const options = [
    { id: "all", label: scopeLabel, count: total },
    ...searched.map((group) => ({
      id: group.id, label: group.label, count: group.items.length,
    })),
  ];
  const selected = options.find((entry) => entry.id === area) ?? options[0];
  const reset = () => { setSearch(""); setArea("all"); };

  if (!platformResolved) {
    return <div data-directory-boot="" role="status" aria-label={`Opening ${title}`} className="min-h-20" />;
  }

  const searchField = presentation === "installed-app" ? (
    <SolarisSearchField value={search} onChange={setSearch} label={searchLabel} placeholder={searchPlaceholder} />
  ) : (
    <label className="v3-directory-search">
      <Search size={18} aria-hidden="true" />
      <span className="sr-only">{searchLabel}</span>
      <input type="search" value={search} aria-label={searchLabel}
        onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} autoComplete="off" />
    </label>
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
              <button type="button" aria-pressed={area === option.id} onClick={() => setArea(option.id)}>
                {option.label} <span>{option.count}</span>
              </button>
            </SheetClose>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  ) : presentation === "mobile-web" ? (
    <label className="v3-directory-area-select">
      <span className="sr-only">{`Browse ${itemNoun} by category`}</span>
      <select aria-label={`Browse ${itemNoun} by category`} value={area}
        onChange={(event) => setArea(event.target.value)}>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label} ({option.count})</option>)}
      </select>
    </label>
  ) : null;

  const contents = (
    <>
      <div className="v3-directory-controls">{searchField}{scopeControl}</div>
      <p className="v3-directory-results-count" role="status">{visible} matching {itemNoun}</p>
      <div className="v3-directory-groups">
        {scoped.filter((group) => group.items.length > 0).map((group) => (
          <section key={group.id} className="v3-directory-group" aria-labelledby={`directory-${group.id}`}>
            {presentation === "installed-app" ? (
              <AppSectionHeader eyebrow="Browse" id={`directory-${group.id}`} title={group.label} />
            ) : <h2 id={`directory-${group.id}`} className="v3-directory-group-title">{group.label}</h2>}
            <DirectoryItems items={group.items} presentation={presentation} />
          </section>
        ))}
      </div>
      {!visible ? (
        <AppEmptyState
          title={`No matching ${itemNoun}`}
          description={emptyText}
          action={<button type="button" className="solaris-app-empty-action" onClick={reset}>Clear filters</button>}
        />
      ) : null}
    </>
  );

  return (
    <AppShell>
      <div className="v3-directory-family" data-directory-experience={presentation}>
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
                <Link to="/explore" className="v3-directory-back">{`Explore / ${title}`}</Link>
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
                    <button key={option.id} type="button" aria-pressed={area === option.id}
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
    </AppShell>
  );
}

function DirectoryItems({ items, presentation }: {
  items: readonly V3DirectoryItem[];
  presentation: V3DirectoryPresentation;
}) {
  if (presentation === "installed-app") {
    return <AppGroupedList>
      {items.map((item) => (
        <Link key={item.id} to={item.to as any} className="solaris-app-list-row">
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
        <Link key={item.id} to={item.to as any} className="v3-directory-mobile-row">
          <span className="min-w-0 flex-1"><strong>{item.title}</strong><span>{item.description}</span></span>
          <ChevronRight size={19} aria-hidden="true" />
        </Link>
      ))}
    </div>;
  }
  return <div className="v3-directory-desktop-grid">
    {items.map((item) => (
      <Link key={item.id} to={item.to as any} className="v3-directory-desktop-card">
        {item.eyebrow ? <span className="v3-directory-eyebrow">{item.eyebrow}</span> : null}
        <span className="v3-directory-card-top"><strong>{item.title}</strong><ChevronRight size={19} aria-hidden="true" /></span>
        <span className="v3-directory-card-description">{item.description}</span>
        {item.aliases?.length ? <span className="v3-directory-aliases">Also known as {item.aliases.join(", ")}</span> : null}
      </Link>
    ))}
  </div>;
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { AppEmptyState, AppGroupedList, AppScreen, AppSectionHeader } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { RulesRouteShell } from "@/components/rules/RulesRouteShell";
import { GovernanceStatusStrip, SolarisDepthPage, SolarisDepthSafeZone } from "@/components/SolarisDepth";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import {
  countRuleChapters,
  filterRuleChapterDirectory,
  RULE_CHAPTER_DIRECTORY_GROUPS,
  type RuleChapterDirectoryChapter,
  type RuleChapterDirectoryGroup,
} from "@/lib/v3-rule-chapter-directory";
import "@/styles/v3-directory-family.css";
import "@/styles/v3-rule-chapters-directory.css";

export const Route = createFileRoute("/rules/chapters/")({
  head: () => ({
    meta: [
      { title: "Rulebook Chapters — Solaris Song Contest" },
      { name: "description", content: "Browse all 22 chapters of the official SSC General Regulations." },
    ],
  }),
  component: RuleChaptersPage,
});

function RuleChaptersPage() {
  const { platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const searched = useMemo(() => filterRuleChapterDirectory(search), [search]);
  const visible = useMemo(() => filterRuleChapterDirectory(search, category), [search, category]);
  const total = countRuleChapters(searched);
  const visibleCount = countRuleChapters(visible);
  const options = [
    { title: "all", label: "All chapters", count: total },
    ...RULE_CHAPTER_DIRECTORY_GROUPS.map((group) => ({
      title: group.title,
      label: group.title,
      count: searched.find((entry) => entry.title === group.title)?.chapters.length ?? 0,
    })),
  ];
  const selectedLabel = options.find((option) => option.title === category)?.label ?? "All chapters";
  const clear = () => { setSearch(""); setCategory("all"); };

  const groups = <RuleChapterGroups groups={visible} presentation={presentation} />;
  const empty = visibleCount === 0 ? (
    <AppEmptyState
      title="No matching chapters"
      description="Try a different chapter number or topic. The official Rulebook is unchanged."
      action={<button type="button" className="solaris-app-empty-action" onClick={clear}>Clear filters</button>}
    />
  ) : null;

  return (
    <RulesRouteShell resolvingTitle="Opening Rulebook chapters">
      <SolarisDepthPage tone="rules">
        <SolarisDepthSafeZone>
          {!platformResolved ? (
            <div data-directory-boot="" role="status" aria-label="Opening Rulebook chapters" className="min-h-20" />
          ) : (
            <div className="v3-directory-family" data-directory-experience={presentation}>
              {presentation === "installed-app" ? (
                <AppScreen>
                  <header className="v3-directory-app-heading">
                    <p className="v3-directory-eyebrow">OFFICIAL RULEBOOK</p>
                    <h1>22 chapters</h1>
                    <p>Find the official General Regulations by chapter or topic.</p>
                    <GovernanceStatusStrip context="rules" className="mt-3" />
                  </header>
                  <RuleChapterControls
                    presentation={presentation}
                    search={search}
                    setSearch={setSearch}
                    category={category}
                    setCategory={setCategory}
                    selectedLabel={selectedLabel}
                    options={options}
                  />
                  <p className="v3-directory-results-count" role="status">{visibleCount} matching chapters</p>
                  {groups}
                  {empty}
                  <Link to="/rules/search" search={{ q: "" }} className="v3-directory-rules-search-link">
                    <Search size={18} aria-hidden="true" /> Search full rule text
                  </Link>
                </AppScreen>
              ) : (
                <>
                  {presentation === "mobile-web" ? (
                    <header className="v3-directory-mobile-header" data-directory-mobile-header="">
                      <Link to="/rules" className="v3-directory-back">Rules / Chapters</Link>
                      <p className="v3-directory-eyebrow">OFFICIAL RULEBOOK</p>
                      <h1>22 chapters</h1>
                      <p>Browse the official General Regulations by topic. Chapter numbering stays unchanged.</p>
                      <GovernanceStatusStrip context="rules" className="mt-3" />
                    </header>
                  ) : (
                    <header className="v3-directory-rules-desktop-header">
                      <p className="v3-directory-eyebrow">OFFICIAL RULEBOOK</p>
                      <h1>22 chapters</h1>
                      <p>Explore the General Regulations by subject. The categories guide browsing, not the official numbering.</p>
                      <div className="v3-directory-rules-header-footer">
                        <GovernanceStatusStrip context="rules" />
                        <Link to="/rules/search" search={{ q: "" }} className="v3-directory-rules-search-link">
                          <Search size={18} aria-hidden="true" /> Search all rules
                        </Link>
                      </div>
                    </header>
                  )}
                  <div className="v3-directory-workspace">
                    {presentation === "desktop-web" ? (
                      <aside className="v3-directory-desktop-rail" aria-label="Filter chapters by category">
                        <h2>Browse chapters</h2>
                        {options.map((option) => (
                          <button key={option.title} type="button" aria-pressed={category === option.title}
                            onClick={() => setCategory(option.title)}>
                            <span>{option.label}</span><span>{option.count}</span>
                          </button>
                        ))}
                      </aside>
                    ) : null}
                    <div className="v3-directory-results">
                      <RuleChapterControls
                        presentation={presentation}
                        search={search}
                        setSearch={setSearch}
                        category={category}
                        setCategory={setCategory}
                        selectedLabel={selectedLabel}
                        options={options}
                      />
                      <p className="v3-directory-results-count" role="status">{visibleCount} matching chapters</p>
                      {groups}
                      {empty}
                      {presentation === "mobile-web" ? (
                        <Link to="/rules/search" search={{ q: "" }} className="v3-directory-rules-search-link">
                          <Search size={18} aria-hidden="true" /> Search full rule text
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </SolarisDepthSafeZone>
      </SolarisDepthPage>
    </RulesRouteShell>
  );
}

type DirectoryCategory = { title: string; label: string; count: number };

function RuleChapterControls({
  presentation,
  search,
  setSearch,
  category,
  setCategory,
  selectedLabel,
  options,
}: {
  presentation: V3DirectoryPresentation;
  search: string;
  setSearch: (next: string) => void;
  category: string;
  setCategory: (next: string) => void;
  selectedLabel: string;
  options: DirectoryCategory[];
}) {
  return (
    <div className="v3-directory-controls">
      {presentation === "installed-app" ? (
        <SolarisSearchField value={search} onChange={setSearch}
          label="Search Rulebook chapters" placeholder="Search titles or numbers…" />
      ) : (
        <label className="v3-directory-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search Rulebook chapters</span>
          <input type="search" value={search} aria-label="Search Rulebook chapters"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chapter titles, numbers or subjects…" autoComplete="off" />
        </label>
      )}
      {presentation === "mobile-web" ? (
        <label className="v3-directory-area-select">
          <span className="sr-only">Browse chapters by category</span>
          <select aria-label="Browse chapters by category" value={category}
            onChange={(event) => setCategory(event.target.value)}>
            {options.map((option) => (
              <option key={option.title} value={option.title}>{option.label} ({option.count})</option>
            ))}
          </select>
        </label>
      ) : null}
      {presentation === "installed-app" ? (
        <Sheet>
          <SheetTrigger asChild>
            <button type="button" className="v3-directory-sheet-trigger" aria-label="Filter chapters by category">
              <SlidersHorizontal size={18} aria-hidden="true" />
              <span>{selectedLabel}</span>
              <span className="v3-directory-count">{options.find((option) => option.title === category)?.count ?? 0}</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" aria-label="Filter chapters by category" className="max-h-[80dvh] overflow-y-auto">
            <h2 className="mb-3 text-lg font-bold">Browse by category</h2>
            <div className="v3-directory-sheet-options">
              {options.map((option) => (
                <SheetClose asChild key={option.title}>
                  <button type="button" aria-pressed={category === option.title}
                    onClick={() => setCategory(option.title)}>
                    {option.label} <span>{option.count}</span>
                  </button>
                </SheetClose>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

function RuleChapterGroups({
  groups,
  presentation,
}: {
  groups: readonly RuleChapterDirectoryGroup[];
  presentation: V3DirectoryPresentation;
}) {
  return (
    <div className="v3-directory-groups">
      {groups.map((group) => (
        <section className="v3-directory-group" key={group.title}
          aria-labelledby={`rule-chapter-group-${group.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
          {presentation === "installed-app" ? (
            <AppSectionHeader eyebrow="General Regulations" title={group.title}
              id={`rule-chapter-group-${group.title.toLowerCase().replace(/[^a-z]+/g, "-")}`} />
          ) : (
            <h2 className="v3-directory-group-title"
              id={`rule-chapter-group-${group.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{group.title}</h2>
          )}
          {presentation === "installed-app" ? (
            <AppGroupedList>
              {group.chapters.map((chapter) => (
                <RuleChapterLink key={chapter.number} chapter={chapter} presentation={presentation} />
              ))}
            </AppGroupedList>
          ) : (
            <div className={presentation === "mobile-web" ? "v3-directory-mobile-list" : "v3-directory-desktop-grid"}>
              {group.chapters.map((chapter) => (
                <RuleChapterLink key={chapter.number} chapter={chapter} presentation={presentation} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function RuleChapterLink({
  chapter,
  presentation,
}: {
  chapter: RuleChapterDirectoryChapter;
  presentation: V3DirectoryPresentation;
}) {
  const number = String(chapter.number).padStart(2, "0");
  if (presentation === "installed-app") {
    return (
      <Link to="/rules/chapters/$chapter" params={{ chapter: chapter.slug }} className="solaris-app-list-row">
        <span className="v3-directory-rule-number">{number}</span>
        <span className="min-w-0 flex-1">
          <strong className="block text-sm font-semibold">{chapter.title}</strong>
          <span className="block text-xs leading-5 text-muted-foreground">{chapter.description}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    );
  }
  if (presentation === "mobile-web") {
    return (
      <Link to="/rules/chapters/$chapter" params={{ chapter: chapter.slug }} className="v3-directory-mobile-row">
        <span className="v3-directory-rule-number">{number}</span>
        <span className="min-w-0 flex-1">
          <strong>{chapter.title}</strong>
          <span>{chapter.description}</span>
        </span>
        <ChevronRight size={18} aria-hidden="true" />
      </Link>
    );
  }
  return (
    <Link to="/rules/chapters/$chapter" params={{ chapter: chapter.slug }} className="v3-directory-desktop-card">
      <span className="v3-directory-eyebrow"><BookOpen size={14} aria-hidden="true" /> Chapter {number}</span>
      <span className="v3-directory-card-top">
        <strong>{chapter.title}</strong><ChevronRight size={18} aria-hidden="true" />
      </span>
      <span className="v3-directory-card-description">{chapter.description}</span>
      <span className="v3-directory-aliases">{chapter.rules.length} official rules</span>
    </Link>
  );
}

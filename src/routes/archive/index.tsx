import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive, BookOpen, CalendarDays, ChevronRight, Flag, Gamepad2,
  Newspaper, Search, SlidersHorizontal, Tv2, type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { AppEmptyState, AppGroupedList, AppScreen, AppSectionHeader } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import "@/styles/v3-directory-family.css";

export const Route = createFileRoute("/archive/")({
  head: () => ({
    meta: [
      { title: "Archive — Solaris Studio" },
      {
        name: "description",
        content: "Explore published Solaris history across editions, countries, shows, stories, reference material and archive games.",
      },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/archive" }],
  }),
  component: ArchiveRootPage,
});

type ArchiveGroup = "all" | "history" | "reference";
type ArchiveDestination = {
  title: string;
  description: string;
  to: string;
  icon: LucideIcon;
  group: Exclude<ArchiveGroup, "all">;
};

const ARCHIVE_DESTINATIONS: readonly ArchiveDestination[] = [
  { title: "Editions", description: "Browse contest editions and their published historical context.", to: "/editions", icon: CalendarDays, group: "history" },
  { title: "Countries", description: "Follow country identities, entries, results and participation history.", to: "/countries", icon: Flag, group: "history" },
  { title: "Shows", description: "Open published semi-finals, finals and other historical show records.", to: "/shows", icon: Tv2, group: "history" },
  { title: "Stories", description: "Read current and historical stories already released to the public.", to: "/stories", icon: Newspaper, group: "history" },
  { title: "Reference", description: "Search publication-safe Solaris history across connected public entities.", to: "/encyclopedia", icon: BookOpen, group: "reference" },
  { title: "Archive Games", description: "Play retained historical games without changing official contest truth.", to: "/archive-games", icon: Gamepad2, group: "reference" },
];

const ARCHIVE_GROUPS = [
  { id: "history", title: "Published history", description: "Contest editions, countries, broadcasts and stories." },
  { id: "reference", title: "Reference and games", description: "Look up historical facts or explore archive games." },
] as const;

function ArchiveRootPage() {
  const { platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<ArchiveGroup>("all");
  const normalized = search.trim().toLowerCase();
  const matched = ARCHIVE_DESTINATIONS.filter((destination) =>
    `${destination.title} ${destination.description}`.toLowerCase().includes(normalized),
  );
  const visible = matched.filter((destination) => group === "all" || destination.group === group);
  const filterGroups = ARCHIVE_GROUPS.map((entry) => ({
    ...entry,
    count: matched.filter((destination) => destination.group === entry.id).length,
  }));
  const reset = () => { setSearch(""); setGroup("all"); };

  if (!platformResolved) {
    return <div data-directory-boot="" role="status" aria-label="Opening the archive" className="min-h-20" />;
  }

  return (
    <AppShell>
      <div className="v3-directory-family v3-archive-directory" data-directory-experience={presentation}>
        {presentation === "installed-app" ? (
          <AppScreen>
            <header className="v3-directory-app-heading">
              <p className="v3-directory-eyebrow">HISTORICAL SOLARIS</p>
              <h1>Archive</h1>
              <p>Explore the published contest record, not live participation tasks.</p>
            </header>
            <ArchiveSearch presentation={presentation} search={search} setSearch={setSearch}
              group={group} setGroup={setGroup} matched={matched.length} groups={filterGroups} />
            <p className="v3-directory-results-count" role="status">{visible.length} destinations</p>
            <ArchiveGroups presentation={presentation} destinations={visible} />
            {!visible.length ? <ArchiveEmpty onReset={reset} /> : null}
            <ArchiveContext />
          </AppScreen>
        ) : (
          <>
            {presentation === "mobile-web" ? (
              <header className="v3-directory-mobile-header" data-directory-mobile-header="">
                <Link to="/explore" className="v3-directory-back">Explore / Archive</Link>
                <p className="v3-directory-eyebrow">HISTORICAL SOLARIS</p>
                <h1>Archive</h1>
                <p>Explore published SSC history, always within its original edition context.</p>
              </header>
            ) : (
              <PageHeader
                eyebrow="Explore Solaris"
                title="Archive"
                description="Published Solaris history, kept in its original contest context."
              />
            )}
            <div className="v3-directory-workspace">
              {presentation === "desktop-web" ? (
                <aside className="v3-directory-desktop-rail" aria-label="Filter archive by subject">
                  <h2>Browse history</h2>
                  <button type="button" aria-pressed={group === "all"} onClick={() => setGroup("all")}>
                    <span>All topics</span><span>{matched.length}</span>
                  </button>
                  {filterGroups.map((entry) => (
                    <button key={entry.id} type="button" aria-pressed={group === entry.id}
                      onClick={() => setGroup(entry.id)}>
                      <span>{entry.title}</span><span>{entry.count}</span>
                    </button>
                  ))}
                </aside>
              ) : null}
              <div className="v3-directory-results">
                <ArchiveContext />
                <ArchiveSearch presentation={presentation} search={search} setSearch={setSearch}
                  group={group} setGroup={setGroup} matched={matched.length} groups={filterGroups} />
                <p className="v3-directory-results-count" role="status">{visible.length} destinations</p>
                <ArchiveGroups presentation={presentation} destinations={visible} />
                {!visible.length ? <ArchiveEmpty onReset={reset} /> : null}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function ArchiveSearch({
  presentation, search, setSearch, group, setGroup, matched, groups,
}: {
  presentation: V3DirectoryPresentation;
  search: string;
  setSearch: (value: string) => void;
  group: ArchiveGroup;
  setGroup: (value: ArchiveGroup) => void;
  matched: number;
  groups: Array<{ id: Exclude<ArchiveGroup, "all">; title: string; count: number }>;
}) {
  const choices = [
    { id: "all", title: "All topics", count: matched },
    ...groups,
  ] as const;
  return (
    <div className="v3-directory-controls">
      {presentation === "installed-app" ? (
        <SolarisSearchField value={search} onChange={setSearch} label="Search archive" placeholder="Search archived content…" />
      ) : (
        <label className="v3-directory-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search archive</span>
          <input type="search" aria-label="Search archive" value={search}
            onChange={(event) => setSearch(event.target.value)} placeholder="Search archive subjects…" />
        </label>
      )}
      {presentation === "installed-app" ? (
        <Sheet>
          <SheetTrigger asChild>
            <button type="button" className="v3-directory-sheet-trigger" aria-label="Filter archive by subject">
              <SlidersHorizontal size={18} aria-hidden="true" />
              <span>{choices.find((entry) => entry.id === group)?.title}</span>
              <span className="v3-directory-count">{choices.find((entry) => entry.id === group)?.count}</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" aria-label="Filter archive by subject" className="max-h-[80dvh] overflow-y-auto">
            <h2 className="mb-3 text-lg font-bold">Browse archive topics</h2>
            <div className="v3-directory-sheet-options">
              {choices.map((entry) => (
                <SheetClose asChild key={entry.id}>
                  <button type="button" aria-pressed={group === entry.id} onClick={() => setGroup(entry.id)}>
                    {entry.title} <span>{entry.count}</span>
                  </button>
                </SheetClose>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      ) : presentation === "mobile-web" ? (
        <label className="v3-directory-area-select">
          <span className="sr-only">Browse archive topics</span>
          <select aria-label="Browse archive topics" value={group}
            onChange={(event) => setGroup(event.target.value as ArchiveGroup)}>
            {choices.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.title} ({entry.count})</option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  );
}

function ArchiveGroups({
  presentation, destinations,
}: {
  presentation: V3DirectoryPresentation;
  destinations: readonly ArchiveDestination[];
}) {
  return (
    <div className="v3-directory-groups">
      {ARCHIVE_GROUPS.map((group) => {
        const items = destinations.filter((item) => item.group === group.id);
        if (!items.length) return null;
        const headingId = `archive-${group.id}`;
        return (
          <section key={group.id} aria-labelledby={headingId} className="v3-directory-group">
            {presentation === "installed-app" ? (
              <AppSectionHeader id={headingId} eyebrow="Historical browsing" title={group.title} />
            ) : (
              <h2 id={headingId} className="v3-directory-group-title">{group.title}</h2>
            )}
            {presentation === "installed-app" ? (
              <AppGroupedList>
                {items.map((item) => (
                  <Link key={item.to} to={item.to as any} className="solaris-app-list-row">
                    <item.icon size={19} className="shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <strong className="block text-sm">{item.title}</strong>
                      <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.description}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ))}
              </AppGroupedList>
            ) : presentation === "mobile-web" ? (
              <div className="v3-directory-mobile-list">
                {items.map((item) => (
                  <Link key={item.to} to={item.to as any} className="v3-directory-mobile-row">
                    <item.icon size={20} className="shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <strong>{item.title}</strong><span>{item.description}</span>
                    </span>
                    <ChevronRight size={19} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="v3-directory-desktop-grid">
                {items.map((item) => (
                  <Link key={item.to} to={item.to as any} className="v3-directory-desktop-card">
                    <span className="v3-directory-card-top">
                      <strong className="flex items-center gap-2">
                        <item.icon size={19} className="text-primary" aria-hidden="true" />
                        {item.title}
                      </strong>
                      <ChevronRight size={19} aria-hidden="true" />
                    </span>
                    <span className="v3-directory-card-description">{item.description}</span>
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

function ArchiveContext() {
  return (
    <section className="v3-archive-context mb-6 rounded-2xl border border-border bg-surface/55 p-4"
      aria-labelledby="archive-context-heading">
      <div className="flex items-start gap-3">
        <Archive size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 id="archive-context-heading" className="text-sm font-bold">Historical context stays historical</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Archive destinations show published records from their own edition and time context.
            Current participation responsibilities belong in Participate, not in historical browsing.
          </p>
        </div>
      </div>
    </section>
  );
}

function ArchiveEmpty({ onReset }: { onReset: () => void }) {
  return <AppEmptyState title="No archive topics found"
    description="Try another historical topic or category."
    action={<button type="button" onClick={onReset} className="solaris-app-empty-action">Clear filters</button>} />;
}

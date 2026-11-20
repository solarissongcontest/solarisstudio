import "@/styles/v3-records-website-editorial.css";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import {
  ArchiveDataError,
  ArchiveDataLoading,
  archiveHasError,
  archiveIsLoading,
} from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { ResponsiveTabs } from "@/components/ResponsiveTabs";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { usePublicPresentationMode } from "@/lib/use-public-presentation-mode";
import { usePublicLaunchAvailability } from "@/lib/public-launch-context";
import { V3RecordsGate } from "@/components/v3/V3RecordsGate";
import { buildCanonicalFanRecordsWithCoverage } from "@/lib/canonical-fan-records";
import { filterPublishedFanRecords } from "@/lib/fan-records-search";
import {
  createRecordsDirectorySearch,
  parseRecordsDirectoryState,
} from "@/lib/fan-records-directory-state";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import {
  type FanRecord,
  type FanRecordCategory,
  type FanRecordHolder,
} from "@/lib/fan-records";

export const Route = createFileRoute("/records/")({
  head: () => ({ meta: [{ title: "Records — Solaris Studio" }] }),
  component: RecordsPage,
});

const TABS = [
  { value: "all", label: "All" },
  { value: "career", label: "Career" },
  { value: "streaks", label: "Streaks" },
  { value: "edition", label: "Edition" },
  { value: "voting", label: "Voting" },
  { value: "regional", label: "Regional" },
  { value: "unusual", label: "Unusual" },
] as const;

type Tab = (typeof TABS)[number]["value"];

const CATEGORY_LABELS: Record<FanRecordCategory, string> = {
  career: "Career",
  streaks: "Streak",
  edition: "Edition",
  voting: "Voting",
  regional: "Regional",
  unusual: "Unusual",
};

function RecordsPage() {
  const { isAppMode, platformResolved } = useSolarisApp();

  if (!platformResolved) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10" data-v3-records-boot="">
        <h1 className="text-3xl font-bold">Records</h1>
        <p role="status" className="mt-3">
          Opening published archive records…
        </p>
      </main>
    );
  }

  if (isAppMode) {
    return <V3RecordsGate fallback={<LegacyRecordsPage />} />;
  }

  return <LegacyRecordsPage />;
}

function RecordsPageHeader({ mobileWeb, ready, showArchiveGames }: { mobileWeb: boolean; ready: boolean; showArchiveGames: boolean }) {
  if (mobileWeb) {
    return (
      <header
        className={`mb-5 border-b border-border/70 ${ready ? "pb-5" : "pb-4"}`}
        data-records-mobile-web-header
      >
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-primary">Hall of records</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight">Records</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {ready
            ? "Achievements, streaks and unusual results from the published SSC archive. Tied countries share the record."
            : "Verified records from the published archive."}
        </p>
        {showArchiveGames ? (
          <Link
            to="/archive-games"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            Play Archive Games →
          </Link>
        ) : null}
      </header>
    );
  }

  return (
    <PageHeader
      eyebrow="Hall of records"
      title="Records"
      description={
        ready
          ? "Published records, remarkable achievements and the countries that hold them."
          : "Verified records from the published archive."
      }
      actions={showArchiveGames ? (
        <Link
          to="/archive-games"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-center text-sm sm:w-auto"
        >
          Play Archive Games →
        </Link>
      ) : undefined}
    />
  );
}

function LegacyRecordsPage() {
  const { isAppMode } = useSolarisApp();
  const { allowsReleased } = usePublicLaunchAvailability();
  const [recordSearch, setRecordSearch] = useState("");
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const participantsQuery = useAllParticipants();
  const resultsQuery = useAllResults();
  const juryQuery = useAllJuryVotes();
  const { data: countries } = countriesQuery;
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const { data: participants } = participantsQuery;
  const { data: results } = resultsQuery;
  const { data: jury } = juryQuery;
  // Opening every record at once produced a several-screen wall on desktop and
  // an even longer mobile page. Start with the most useful category and keep
  // "All" available for people who deliberately want the full archive.
  const [tab, setTab] = useState<Tab>("career");
  const presentationMode = usePublicPresentationMode();
  const mobileWeb = presentationMode === "mobile-web";

  // The website has shareable discovery filters. The installed PWA retains its
  // existing category, independent of browser query parameters.
  useEffect(() => {
    if (isAppMode) return;
    const restoreFromLocation = () => {
      const state = parseRecordsDirectoryState(window.location.search);
      setTab(state.category);
      setRecordSearch(state.search);
    };
    restoreFromLocation();
    window.addEventListener("popstate", restoreFromLocation);
    return () => window.removeEventListener("popstate", restoreFromLocation);
  }, [isAppMode]);

  const updateBrowserLocation = (
    category: Tab,
    search: string,
    method: "pushState" | "replaceState",
  ) => {
    if (isAppMode) return;
    const nextSearch = createRecordsDirectorySearch(window.location.search, { category, search });
    const next = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history[method](window.history.state, "", next);
  };
  const changeCategory = (category: Tab) => {
    if (category === tab) return;
    setTab(category);
    updateBrowserLocation(category, recordSearch, "pushState");
  };
  const changeSearch = (value: string) => {
    const search = value.slice(0, 160);
    setRecordSearch(search);
    updateBrowserLocation(tab, search, "replaceState");
  };
  const showAllRecords = () => {
    setTab("all");
    setRecordSearch("");
    updateBrowserLocation("all", "", "pushState");
  };

  const { records, archivedFinalEditions } = useMemo(
    () =>
      buildCanonicalFanRecordsWithCoverage({
        countries: countries ?? [],
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        jury: jury ?? [],
      }),
    [countries, editions, shows, participants, results, jury],
  );

  const normalizedRecordSearch = isAppMode ? "" : recordSearch.trim();
  const filtered = filterPublishedFanRecords(records, tab, normalizedRecordSearch);
  const categoryTotal = tab === "all"
    ? records.length
    : records.filter((record) => record.category === tab).length;
  const coverageDescription = (
    <>
      These records use {archivedFinalEditions} edition{archivedFinalEditions === 1 ? "" : "s"} with archived
      Grand Final results, plus the jury and qualification data that is actually stored.
      Missing editions are excluded rather than treated as zeroes, so records can change when older archive data is added.
    </>
  );
  const archiveQueries = [
    countriesQuery,
    editionsQuery,
    showsQuery,
    participantsQuery,
    resultsQuery,
    juryQuery,
  ];
  const loading = archiveIsLoading(...archiveQueries);
  const failed = archiveHasError(...archiveQueries);
  if (loading || failed) {
    return (
      <AppShell>
        <RecordsPageHeader mobileWeb={mobileWeb} ready={false} showArchiveGames={false} />
        {loading ? (
          <ArchiveDataLoading label="Calculating records from the archive…" />
        ) : (
          <ArchiveDataError />
        )}
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div data-records-presentation={presentationMode}>
        <RecordsPageHeader mobileWeb={mobileWeb} ready showArchiveGames={allowsReleased("/archive-games")} />

        {isAppMode ? (
          <Panel className="mb-5" title="Archive coverage">
            <p className="text-xs leading-relaxed text-muted-foreground">{coverageDescription}</p>
          </Panel>
        ) : (
          <details
            className="records-editorial-coverage mb-5 border-y border-border/70"
            data-records-mobile-web-coverage={mobileWeb ? "" : undefined}
            data-records-desktop-web-coverage={!mobileWeb ? "" : undefined}
          >
            <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 py-3 text-sm font-semibold">
              <span>Archive coverage</span>
              <span className="text-xs font-medium text-muted-foreground">{archivedFinalEditions} final editions</span>
            </summary>
            <p className="pb-4 text-sm leading-6 text-muted-foreground">{coverageDescription}</p>
          </details>
        )}

        {mobileWeb ? (
          <nav aria-label="Record categories" className="mb-5 flex min-w-0 gap-4 overflow-x-auto border-b border-border/70" data-records-mobile-web-categories>
            {TABS.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => changeCategory(option.value)}
                aria-pressed={tab === option.value}
                className={tab === option.value
                  ? "min-h-12 shrink-0 whitespace-nowrap border-b-2 border-primary px-1 text-sm font-semibold text-foreground"
                  : "min-h-12 shrink-0 whitespace-nowrap border-b-2 border-transparent px-1 text-sm font-medium text-muted-foreground hover:text-foreground"}
              >
                {option.label}
              </button>
            ))}
          </nav>
        ) : (
          <ResponsiveTabs value={tab} options={TABS} onChange={changeCategory} label="Record category" className="mb-5" />
        )}

        {!isAppMode ? (
          <div className="records-editorial-searchbar" role="search" aria-label="Search published records">
            <label htmlFor="records-editorial-query">Search published records</label>
            <input
              id="records-editorial-query"
              type="search"
              value={recordSearch}
              onChange={(event) => changeSearch(event.target.value)}
              placeholder="Record, country, artist or song"
              autoComplete="off"
              maxLength={160}
            />
            {recordSearch.length > 0 ? (
              <button type="button" className="records-editorial-clear" onClick={() => changeSearch("")}>
                Clear search
              </button>
            ) : null}
            <span role="status" aria-live="polite" data-records-website-count>
              {filtered.length} of {categoryTotal} {categoryTotal === 1 ? "record" : "records"}
            </span>
          </div>
        ) : null}

        {filtered.length ? (
          <div className={mobileWeb ? "min-w-0 divide-y divide-border/70" : "records-editorial-grid grid gap-3 lg:grid-cols-2 2xl:grid-cols-3"}>
            {filtered.map((record) => (
              <RecordCard key={record.id} record={record} mobileWeb={mobileWeb} />
            ))}
          </div>
        ) : isAppMode ? (
          <Panel>
            <p className="text-sm text-muted-foreground">No records in this category yet.</p>
          </Panel>
        ) : (
          <div className="records-editorial-empty py-6" role="status">
            <p className="text-sm text-muted-foreground">
              {normalizedRecordSearch
                ? "No published records match your search."
                : tab === "all"
                  ? "No published records are available yet."
                  : "No records in this category yet."}
            </p>
            {(tab !== "all" || normalizedRecordSearch) && (
              <button
                type="button"
                className="records-editorial-reset"
                onClick={showAllRecords}
              >
                Show all published records
              </button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function RecordCard({ record, mobileWeb }: { record: FanRecord; mobileWeb: boolean }) {
  const primaryHolders = record.holders.slice(0, 8);
  const remainingHolders = record.holders.slice(8);

  return (
    <article id={`record-${record.id}`} className={mobileWeb ? "min-w-0 py-5 first:pt-0" : "records-editorial-desktop-row flex min-h-[250px] min-w-0 flex-col overflow-hidden p-4 sm:p-5"} data-records-mobile-web-row={mobileWeb ? "" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
            {CATEGORY_LABELS[record.category]}
          </p>
          <h2 className="mt-1 break-words font-display text-lg font-bold leading-tight sm:text-xl">
            {record.label}
          </h2>
        </div>
        {record.holders.length > 1 && (
          <span className="shrink-0 rounded-full border border-primary/20 bg-primary/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-primary">
            {record.holders.length} tied
          </span>
        )}
      </div>

      <p className={mobileWeb ? "numeric mt-3 break-words text-[clamp(1.65rem,8vw,2.5rem)] font-extrabold tracking-tight text-foreground" : "numeric mt-4 break-words text-3xl font-black tracking-[-.045em] text-foreground"}>
        {record.value}
      </p>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
        {record.explanation}
      </p>

      <div className={mobileWeb ? "mt-4 divide-y divide-border/55 border-y border-border/65" : "records-editorial-holders mt-4 divide-y divide-border/55 rounded-xl border border-border/60 bg-surface/45 px-3"}>
        {primaryHolders.map((holder) => (
          <RecordHolderRow key={holder.countryId} holder={holder} mobileWeb={mobileWeb} />
        ))}
      </div>

      {remainingHolders.length > 0 && (
        <details className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-surface/35">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
            Show all {record.holders.length} tied countries ▾
          </summary>
          <div className="divide-y divide-border/55 border-t border-border/55 px-3">
            {remainingHolders.map((holder) => (
              <RecordHolderRow key={holder.countryId} holder={holder} mobileWeb={mobileWeb} />
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

function RecordHolderRow({ holder, mobileWeb }: { holder: FanRecordHolder; mobileWeb: boolean }) {
  const { allowsReleased } = usePublicLaunchAvailability();
  const canOpenCountry = allowsReleased(`/countries/${encodeURIComponent(holder.shortCode)}`);
  return (
    <div className="py-3 first:pt-2.5 last:pb-2.5">
      <div className="flex min-w-0 items-start gap-3">
        <FlagChip
          code={holder.shortCode}
          color={holder.accentColor}
          image={holder.flagImage}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {canOpenCountry ? (
              <Link
                to="/countries/$code"
                params={{ code: holder.shortCode }}
                className={mobileWeb ? "break-words text-sm font-semibold text-foreground hover:text-primary" : "truncate text-sm font-semibold text-foreground hover:text-primary"}
              >
                {holder.countryName}
              </Link>
            ) : (
              <span className="break-words text-sm font-semibold text-foreground">{holder.countryName}</span>
            )}
            {holder.editionLabel && (
              <span className="text-[10px] text-muted-foreground">
                {holder.editionLabel}
              </span>
            )}
          </div>
          {(holder.artist || holder.song) && (
            <p className={mobileWeb ? "mt-1 break-words text-xs font-medium leading-5 text-foreground/85" : "mt-1 truncate text-[11px] font-medium text-foreground/85"}>
              {[holder.artist, holder.song].filter(Boolean).join(" · ")}
            </p>
          )}
          {holder.context && (
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              {holder.context}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

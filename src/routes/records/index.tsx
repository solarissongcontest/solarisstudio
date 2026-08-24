import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { ResponsiveTabs } from "@/components/ResponsiveTabs";
import { buildCanonicalFanRecords } from "@/lib/canonical-fan-records";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import { type FanRecord, type FanRecordCategory, type FanRecordHolder } from "@/lib/fan-records";

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
  const [tab, setTab] = useState<Tab>("all");

  const records = useMemo(
    () =>
      buildCanonicalFanRecords({
        countries: countries ?? [],
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        jury: jury ?? [],
      }),
    [countries, editions, shows, participants, results, jury],
  );

  const filtered = tab === "all" ? records : records.filter((record) => record.category === tab);
  const showById = useMemo(() => new Map((shows ?? []).map((show) => [show.id, show])), [shows]);
  const archivedFinalEditions = useMemo(
    () =>
      new Set(
        (results ?? [])
          .filter((result) => {
            const kind = showById.get(result.show_id ?? "")?.kind;
            return kind === "grand-final" || kind === "final";
          })
          .map((result) => result.edition_id),
      ).size,
    [results, showById],
  );

  const archiveQueries = [countriesQuery, editionsQuery, showsQuery, participantsQuery, resultsQuery, juryQuery];
  if (archiveIsLoading(...archiveQueries)) return <AppShell><PageHeader eyebrow="Hall of records" title="Records" description="Verified records from the published archive." /><ArchiveDataLoading label="Calculating records from the archive…" /></AppShell>;
  if (archiveHasError(...archiveQueries)) return <AppShell><PageHeader eyebrow="Hall of records" title="Records" description="Verified records from the published archive." /><ArchiveDataError /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Hall of records"
        title="Records"
        description="The extreme, impressive and occasionally unfortunate corners of SSC history, with ties shown properly instead of quietly choosing one country and hoping nobody notices."
        actions={
          <Link to="/archive-games" className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-center text-sm sm:w-auto">
            Play Archive Games →
          </Link>
        }
      />

      <Panel className="mb-5" title="Archive coverage">
        <p className="text-xs leading-relaxed text-muted-foreground">
          These records currently use {archivedFinalEditions} edition{archivedFinalEditions === 1 ? "" : "s"} with archived Grand Final results, plus the jury and qualification data that is actually stored. Missing editions are excluded rather than treated as zeroes, so a record can change when older archive data is added.
        </p>
      </Panel>

      <ResponsiveTabs value={tab} options={TABS} onChange={setTab} label="Record category" className="mb-5" />

      {filtered.length ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((record) => <RecordCard key={record.id} record={record} />)}
        </div>
      ) : (
        <Panel><p className="text-sm text-muted-foreground">No records in this category yet.</p></Panel>
      )}
    </AppShell>
  );
}

function RecordCard({ record }: { record: FanRecord }) {
  const primaryHolders = record.holders.slice(0, 8);
  const remainingHolders = record.holders.slice(8);

  return (
    <article className="glass flex min-h-[250px] min-w-0 flex-col overflow-hidden p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">{CATEGORY_LABELS[record.category]}</p>
          <h2 className="mt-1 break-words font-display text-lg font-bold leading-tight sm:text-xl">{record.label}</h2>
        </div>
        {record.holders.length > 1 && (
          <span className="shrink-0 rounded-full border border-primary/20 bg-primary/[0.07] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-primary">
            {record.holders.length} tied
          </span>
        )}
      </div>

      <p className="numeric mt-4 break-words text-3xl font-black tracking-[-.045em] text-foreground">{record.value}</p>
      <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{record.explanation}</p>

      <div className="mt-4 divide-y divide-border/55 rounded-xl border border-border/60 bg-surface/45 px-3">
        {primaryHolders.map((holder) => (
          <RecordHolderRow key={holder.countryId} holder={holder} />
        ))}
      </div>

      {remainingHolders.length > 0 && (
        <details className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-surface/35">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-primary [&::-webkit-details-marker]:hidden">
            Show all {record.holders.length} tied countries ▾
          </summary>
          <div className="divide-y divide-border/55 border-t border-border/55 px-3">
            {remainingHolders.map((holder) => (
              <RecordHolderRow key={holder.countryId} holder={holder} />
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

function RecordHolderRow({ holder }: { holder: FanRecordHolder }) {
  return (
    <div className="py-3 first:pt-2.5 last:pb-2.5">
      <div className="flex min-w-0 items-start gap-3">
        <FlagChip code={holder.shortCode} color={holder.accentColor} image={holder.flagImage} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <Link to="/countries/$code" params={{ code: holder.shortCode }} className="truncate text-sm font-semibold text-foreground hover:text-primary">
              {holder.countryName}
            </Link>
            {holder.editionLabel && (
              <span className="text-[10px] text-muted-foreground">{holder.editionLabel}</span>
            )}
          </div>
          {(holder.artist || holder.song) && (
            <p className="mt-1 truncate text-[11px] font-medium text-foreground/85">
              {[holder.artist, holder.song].filter(Boolean).join(" · ")}
            </p>
          )}
          {holder.context && <p className="mt-1 text-[10px] leading-4 text-muted-foreground">{holder.context}</p>}
        </div>
      </div>
    </div>
  );
}

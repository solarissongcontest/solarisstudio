import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { ResponsiveTabs } from "@/components/ResponsiveTabs";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
  type ResultRow,
} from "@/lib/data";
import { computeHistoricalRecords, type HistoricalRecordEntry } from "@/lib/stats";

export const Route = createFileRoute("/records/")({
  head: () => ({
    meta: [{ title: "Records — Solaris Studio" }],
  }),
  component: RecordsPage,
});

const TABS = [
  { value: "all", label: "All" },
  { value: "career", label: "Career" },
  { value: "streaks", label: "Streaks" },
  { value: "voting", label: "Voting" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function RecordsPage() {
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();
  const [tab, setTab] = useState<Tab>("all");

  const records = useMemo(
    () =>
      computeHistoricalRecords({
        countries: countries ?? [],
        editions: editions ?? [],
        shows: shows ?? [],
        participants: participants ?? [],
        results: results ?? [],
        jury: jury ?? [],
      }),
    [countries, editions, shows, participants, results, jury],
  );

  const requestedRecords = useMemo(
    () =>
      computeBetaRequestedRecords({
        countries: countries ?? [],
        editions: editions ?? [],
        shows: shows ?? [],
        results: results ?? [],
      }),
    [countries, editions, shows, results],
  );

  const allRecords = useMemo(() => {
    const existing = new Set(records.map((record) => record.label.toLowerCase()));
    return [
      ...records,
      ...requestedRecords.filter((record) => !existing.has(record.label.toLowerCase())),
    ];
  }, [records, requestedRecords]);

  const filtered = allRecords.filter((record) => {
    if (tab === "all") return true;
    const label = record.label.toLowerCase();
    if (tab === "career") {
      return /participation|win|points|top|final|career|successful/i.test(label);
    }
    if (tab === "streaks") {
      return /streak|drought|consecutive/i.test(label);
    }
    return /jury|televote|vote|12|point/i.test(label);
  });

  const showById = useMemo(
    () => new Map((shows ?? []).map((show) => [show.id, show])),
    [shows],
  );
  const archivedFinalEditions = useMemo(
    () =>
      new Set(
        (results ?? [])
          .filter((result) => showById.get(result.show_id ?? "")?.kind === "grand-final")
          .map((result) => result.edition_id),
      ).size,
    [results, showById],
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Hall of records"
        title="Records"
        description="The all-time records, presented like records rather than a warehouse inventory system."
        actions={
          <Link
            to="/archive-games"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-center text-sm sm:w-auto"
          >
            Play Archive Games →
          </Link>
        }
      />

      <Panel className="mb-5" title="Archive coverage">
        <p className="text-xs leading-relaxed text-muted-foreground">
          These records currently use {archivedFinalEditions} edition{archivedFinalEditions === 1 ? "" : "s"}
          {" "}with archived Grand Final results. Missing editions are excluded rather than treated as zeroes,
          so records will update automatically as the historical archive is completed.
        </p>
      </Panel>

      <ResponsiveTabs
        value={tab}
        options={TABS}
        onChange={setTab}
        label="Record category"
        className="mb-5"
      />

      <Panel>
        {filtered.length ? (
          <div className="divide-y divide-border/60">
            {filtered.map((record, index) => (
              <div
                key={`${record.label}-${index}`}
                className="grid gap-1 py-4 first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-5"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{record.label}</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{record.detail}</p>
                </div>
                <p className="numeric break-words text-xl font-semibold text-primary sm:text-right">
                  {record.value}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No records in this category yet.</p>
        )}
      </Panel>
    </AppShell>
  );
}

function computeBetaRequestedRecords({
  countries,
  editions,
  shows,
  results,
}: {
  countries: Array<{ id: string; name: string }>;
  editions: Array<{ id: string; edition_number: number | null }>;
  shows: Array<{ id: string; kind: string }>;
  results: ResultRow[];
}): HistoricalRecordEntry[] {
  const countryName = new Map(countries.map((country) => [country.id, country.name]));
  const editionNumber = new Map(editions.map((edition) => [edition.id, edition.edition_number]));
  const showById = new Map(shows.map((show) => [show.id, show]));
  const finalRows = results.filter(
    (result) =>
      showById.get(result.show_id ?? "")?.kind === "grand-final" &&
      result.final_rank != null &&
      editionNumber.get(result.edition_id) != null,
  );

  if (!finalRows.length) return [];

  const rowsByCountry = new Map<string, ResultRow[]>();
  for (const row of finalRows) {
    rowsByCountry.set(row.country_id, [...(rowsByCountry.get(row.country_id) ?? []), row]);
  }

  const records: HistoricalRecordEntry[] = [];

  const top5 = strongestRankStreak(rowsByCountry, editionNumber, 5);
  if (top5) {
    records.push({
      label: "Longest top-5 streak",
      value: `${top5.length} edition${top5.length === 1 ? "" : "s"}`,
      detail: `${countryName.get(top5.countryId) ?? "?"}${formatRange(top5.from, top5.to)}`,
    });
  }

  const podium = strongestRankStreak(rowsByCountry, editionNumber, 3);
  if (podium) {
    records.push({
      label: "Longest podium streak",
      value: `${podium.length} edition${podium.length === 1 ? "" : "s"}`,
      detail: `${countryName.get(podium.countryId) ?? "?"}${formatRange(podium.from, podium.to)}`,
    });
  }

  const careerPoints = [...rowsByCountry.entries()]
    .map(([countryId, rows]) => ({
      countryId,
      points: rows.reduce((sum, row) => sum + row.total_points, 0),
      finals: rows.length,
    }))
    .sort((a, b) => b.points - a.points || b.finals - a.finals)[0];

  if (careerPoints) {
    records.push({
      label: "Most career final points",
      value: String(careerPoints.points),
      detail: `${countryName.get(careerPoints.countryId) ?? "?"} · ${careerPoints.finals} archived final${careerPoints.finals === 1 ? "" : "s"}`,
    });
  }

  return records;
}

function strongestRankStreak(
  rowsByCountry: Map<string, ResultRow[]>,
  editionNumber: Map<string, number | null>,
  maximumRank: number,
) {
  let best: { countryId: string; length: number; from: number; to: number } | null = null;

  for (const [countryId, rows] of rowsByCountry.entries()) {
    const byEdition = new Map<string, ResultRow>();
    for (const row of rows) {
      const current = byEdition.get(row.edition_id);
      if (!current || (row.final_rank ?? 999) < (current.final_rank ?? 999)) {
        byEdition.set(row.edition_id, row);
      }
    }

    const ordered = [...byEdition.values()]
      .map((row) => ({ row, number: editionNumber.get(row.edition_id) }))
      .filter((item): item is { row: ResultRow; number: number } => item.number != null)
      .sort((a, b) => a.number - b.number);

    let length = 0;
    let start = 0;
    let previousEdition: number | null = null;

    for (const item of ordered) {
      const qualifies = item.row.final_rank != null && item.row.final_rank <= maximumRank;
      const consecutive = previousEdition != null && item.number === previousEdition + 1;

      if (qualifies) {
        if (!consecutive || length === 0) {
          length = 1;
          start = item.number;
        } else {
          length += 1;
        }

        if (!best || length > best.length) {
          best = { countryId, length, from: start, to: item.number };
        }
      } else {
        length = 0;
      }

      previousEdition = item.number;
    }
  }

  return best;
}

function formatRange(from: number, to: number) {
  return from === to ? ` · SSC ${from}` : ` · SSC ${from}–${to}`;
}

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
} from "@/lib/data";
import { computeHistoricalRecords } from "@/lib/stats";

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

  const filtered = records.filter((record) => {
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

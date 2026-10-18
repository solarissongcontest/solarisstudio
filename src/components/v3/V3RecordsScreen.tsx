import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { FlagChip } from "@/components/FlagChip";
import type {
  FanRecord,
  FanRecordCategory,
  FanRecordHolder,
} from "@/lib/fan-records";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

const RECORD_TABS = [
  { value: "career", label: "Career" },
  { value: "streaks", label: "Streaks" },
  { value: "edition", label: "Edition" },
  { value: "voting", label: "Voting" },
  { value: "regional", label: "Regional" },
  { value: "unusual", label: "Unusual" },
  { value: "all", label: "All" },
] as const;

type RecordTab = FanRecordCategory | "all";

const CATEGORY_LABELS: Record<FanRecordCategory, string> = {
  career: "Career",
  streaks: "Streak",
  edition: "Edition",
  voting: "Voting",
  regional: "Regional",
  unusual: "Unusual",
};

export function V3RecordsScreen({
  records,
  archivedFinalEditions,
  generatedAt,
}: {
  records: readonly FanRecord[];
  archivedFinalEditions: number;
  generatedAt: string;
}) {
  const [tab, setTab] = useState<RecordTab>("career");
  const filtered = useMemo(
    () => (tab === "all" ? records : records.filter((record) => record.category === tab)),
    [records, tab],
  );

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Hall of records"
        title="Records"
        description="The extreme, impressive and occasionally unfortunate corners of published SSC history, with ties kept intact."
        editorial
      />

      <V3Surface level="raised" className="p-5">
        <p className="v3-kicker">Archive coverage</p>
        <p className="mt-2 text-sm leading-6 text-white/62">
          These records currently use {archivedFinalEditions} edition
          {archivedFinalEditions === 1 ? "" : "s"} with published Grand Final
          results, plus voting and qualification data that is actually public.
          Missing archive data is excluded rather than treated as zero.
        </p>
      </V3Surface>

      <V3Section title="Record categories" meta={`${records.length} records`}>
        <div
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Record category"
        >
          {RECORD_TABS.map((option) => {
            const selected = option.value === tab;
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(option.value)}
                className="min-h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition"
                style={{
                  borderColor: selected
                    ? "var(--v3-border-strong)"
                    : "var(--v3-border-subtle)",
                  background: selected
                    ? "var(--v3-bg-raised)"
                    : "rgba(255,255,255,0.02)",
                  color: selected
                    ? "var(--v3-text-primary)"
                    : "var(--v3-text-secondary)",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {filtered.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {filtered.map((record) => (
              <RecordCard key={record.id} record={record} />
            ))}
          </div>
        ) : (
          <V3Surface className="p-5">
            <div role="status" data-v3-records-empty="">
              <p className="text-sm font-semibold">No records in this category yet</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Solaris only calculates records from archive layers that are canonically public.
              </p>
            </div>
          </V3Surface>
        )}
      </V3Section>

      <p className="sr-only">
        Records projection refreshed from published Solaris state at {generatedAt}.
      </p>
    </V3Screen>
  );
}

function RecordCard({ record }: { record: FanRecord }) {
  const primaryHolders = record.holders.slice(0, 8);
  const remainingHolders = record.holders.slice(8);

  return (
    <V3Surface level="raised" className="flex min-h-64 min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="v3-kicker">{CATEGORY_LABELS[record.category]}</p>
          <h2 className="mt-1 break-words text-lg font-bold leading-tight sm:text-xl">
            {record.label}
          </h2>
        </div>
        {record.holders.length > 1 ? (
          <V3StatusChip tone="neutral">{record.holders.length} tied</V3StatusChip>
        ) : null}
      </div>

      <p className="mt-4 break-words text-3xl font-black tracking-[-0.045em]">
        {record.value}
      </p>
      <p className="mt-2 text-xs leading-5 text-white/48">{record.explanation}</p>

      <div className="mt-4 divide-y divide-white/[0.07] rounded-xl border border-white/[0.07] bg-white/[0.02] px-3">
        {primaryHolders.map((holder) => (
          <RecordHolderRow key={holder.countryId} holder={holder} />
        ))}
      </div>

      {remainingHolders.length > 0 ? (
        <details className="mt-2 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <summary className="cursor-pointer list-none px-3 py-3 text-xs font-semibold text-white/68 [&::-webkit-details-marker]:hidden">
            Show all {record.holders.length} tied countries
          </summary>
          <div className="divide-y divide-white/[0.07] border-t border-white/[0.07] px-3">
            {remainingHolders.map((holder) => (
              <RecordHolderRow key={holder.countryId} holder={holder} />
            ))}
          </div>
        </details>
      ) : null}
    </V3Surface>
  );
}

function RecordHolderRow({ holder }: { holder: FanRecordHolder }) {
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
            <Link
              to="/countries/$code"
              params={{ code: holder.shortCode.toLowerCase() }}
              className="truncate text-sm font-semibold hover:text-primary"
            >
              {holder.countryName}
            </Link>
            {holder.editionLabel ? (
              <span className="text-[0.68rem] text-white/42">{holder.editionLabel}</span>
            ) : null}
          </div>
          {holder.artist || holder.song ? (
            <p className="mt-1 truncate text-xs font-medium text-white/68">
              {[holder.artist, holder.song].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {holder.context ? (
            <p className="mt-1 text-[0.68rem] leading-4 text-white/42">
              {holder.context}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

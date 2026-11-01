import { Link } from "@tanstack/react-router";
import { EyeOff } from "lucide-react";
import { useMemo, useState } from "react";

import { FlagChip } from "@/components/FlagChip";
import type {
  FanRecord,
  FanRecordCategory,
  FanRecordHolder,
} from "@/lib/fan-records";
import {
  V3Screen,
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
  spoilerProtected = false,
  onRevealCurrentEdition,
}: {
  records: readonly FanRecord[];
  archivedFinalEditions: number;
  generatedAt: string;
  spoilerProtected?: boolean;
  onRevealCurrentEdition?: () => void;
}) {
  const [tab, setTab] = useState<RecordTab>("career");
  const filtered = useMemo(
    () => (tab === "all" ? records : records.filter((record) => record.category === tab)),
    [records, tab],
  );

  return (
    <V3Screen>
      <header className="mb-6 max-w-3xl" data-v3-records-header="">
        <p className="v3-kicker">Hall of records</p>
        <h1 className="mt-2 text-[clamp(2rem,9vw,3.25rem)] font-semibold leading-[0.97] tracking-[-0.055em]">
          Records
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">
          The extreme, impressive and occasionally unfortunate corners of published SSC history, with ties kept intact.
        </p>
      </header>

      {spoilerProtected ? (
        <V3Surface level="raised" className="p-5" data-v3-records-spoilers="protected">
          <div className="flex items-start gap-3">
            <EyeOff className="mt-0.5 size-5 shrink-0 text-white/48" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="v3-kicker">Spoiler-free mode</p>
              <h2 className="mt-1 text-lg font-semibold">Current-edition records are hidden</h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-white/48">
                Career totals, streaks and record holders below are calculated without the current public edition so a fresh result cannot leak indirectly through archive statistics.
              </p>
              {onRevealCurrentEdition ? (
                <button
                  type="button"
                  onClick={onRevealCurrentEdition}
                  className="mt-4 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-[var(--v3-bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  Reveal current-edition records
                </button>
              ) : null}
            </div>
          </div>
        </V3Surface>
      ) : null}

      <aside className="mb-7 border-l-2 border-[var(--v3-accent)] pl-4" aria-labelledby="records-coverage-heading">
        <p className="v3-kicker">Archive coverage</p>
        <h2 id="records-coverage-heading" className="mt-1 text-sm font-semibold">
          {archivedFinalEditions} published final edition{archivedFinalEditions === 1 ? "" : "s"} represented
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-white/45">
          Records use published Grand Final, voting and qualification data that actually exists. Missing archive data is excluded rather than treated as zero.
        </p>
      </aside>

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
                className="min-h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
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
          <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]" data-v3-records-list="">
            {filtered.map((record) => (
              <RecordRow key={record.id} record={record} />
            ))}
          </div>
        ) : (
          <div className="border-y border-white/[0.07] py-6" role="status" data-v3-records-empty="">
            <p className="text-sm font-semibold">No records in this category yet</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris only calculates records from archive layers that are canonically public.
            </p>
          </div>
        )}
      </V3Section>

      <p className="sr-only">
        Records projection refreshed from published Solaris state at {generatedAt}.
      </p>
    </V3Screen>
  );
}

function RecordRow({ record }: { record: FanRecord }) {
  const primaryHolders = record.holders.slice(0, 8);
  const remainingHolders = record.holders.slice(8);

  return (
    <article className="grid min-w-0 gap-4 py-5 md:grid-cols-[minmax(0,0.82fr)_minmax(16rem,1.18fr)] md:gap-8" data-v3-record-row="">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="v3-kicker">{CATEGORY_LABELS[record.category]}</p>
          {record.holders.length > 1 ? (
            <V3StatusChip tone="neutral">{record.holders.length} tied</V3StatusChip>
          ) : null}
        </div>
        <h2 className="mt-2 max-w-[28ch] text-[1.1rem] font-semibold leading-tight tracking-[-0.03em] sm:text-[1.2rem]">
          {record.label}
        </h2>
        <p className="mt-3 break-words text-[2rem] font-black leading-none tracking-[-0.05em]">
          {record.value}
        </p>
        <p className="mt-2 max-w-xl text-xs leading-5 text-white/46">{record.explanation}</p>
      </div>

      <div className="min-w-0 border-t border-white/[0.065] md:border-l md:border-t-0 md:pl-6">
        <div className="divide-y divide-white/[0.06]">
          {primaryHolders.map((holder) => (
            <RecordHolderRow key={holder.countryId} holder={holder} />
          ))}
        </div>

        {remainingHolders.length > 0 ? (
          <details className="border-t border-white/[0.065]">
            <summary className="cursor-pointer list-none py-3 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 [&::-webkit-details-marker]:hidden">
              Show all {record.holders.length} tied countries
            </summary>
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {remainingHolders.map((holder) => (
                <RecordHolderRow key={holder.countryId} holder={holder} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </article>
  );
}

function RecordHolderRow({ holder }: { holder: FanRecordHolder }) {
  return (
    <div className="py-3 first:pt-3 last:pb-3">
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
              className="truncate text-sm font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
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

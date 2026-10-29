import { Link } from "@tanstack/react-router";
import { ChevronLeft, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type {
  V3EditionPageProjection,
  V3EditionParticipant,
} from "@/lib/v3-edition";
import { v3EditionOverviewHref } from "@/lib/v3-edition-view";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  type V3StatusTone,
} from "./V3Foundation";

type ParticipantFilter = "all" | V3EditionParticipant["participationStatus"];

const FILTERS: readonly { value: ParticipantFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "confirmed", label: "Participating" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "disqualified", label: "Disqualified" },
];

function statusTone(
  status: V3EditionParticipant["participationStatus"],
): V3StatusTone {
  if (status === "withdrawn") return "warning";
  if (status === "disqualified") return "danger";
  return "neutral";
}

function statusLabel(status: V3EditionParticipant["participationStatus"]) {
  if (status === "withdrawn") return "Withdrawn";
  if (status === "disqualified") return "Disqualified";
  return "Participating";
}

function ParticipantFlag({ participant }: { participant: V3EditionParticipant }) {
  return (
    <span
      className="grid aspect-[3/2] h-8 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.055] text-[0.62rem] font-black text-white/72"
      aria-hidden="true"
      data-v3-flag-ratio="3:2"
    >
      {participant.flagImage ? (
        <img
          src={participant.flagImage}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        participant.shortCode.slice(0, 3)
      )}
    </span>
  );
}

function ParticipantRow({
  participant,
  result,
}: {
  participant: V3EditionParticipant;
  result: V3EditionPageProjection["results"]["rows"][number] | null;
}) {
  const contents = (
    <div className="flex min-h-16 items-center gap-3 py-3">
      <ParticipantFlag participant={participant} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white/92">
          {participant.name}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/48">
          <span>{participant.shortCode}</span>
          {result ? (
            <span className="font-semibold text-white/58">
              #{result.rank} · {result.totalPoints} pts
            </span>
          ) : null}
        </span>
      </span>
      <V3StatusChip tone={statusTone(participant.participationStatus)}>
        {statusLabel(participant.participationStatus)}
      </V3StatusChip>
    </div>
  );

  return participant.href ? (
    <Link
      to={participant.href as any}
      className="block border-b border-white/[0.055] last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      {contents}
    </Link>
  ) : (
    <div className="border-b border-white/[0.055] last:border-b-0">{contents}</div>
  );
}

export function V3EditionParticipantsScreen({
  projection,
  spoilerSafe,
}: {
  projection: V3EditionPageProjection;
  spoilerSafe: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ParticipantFilter>("all");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const resultByIdentity = useMemo(
    () =>
      new Map(
        !spoilerSafe && projection.results.state === "available"
          ? projection.results.rows.map((row) => [row.id, row] as const)
          : [],
      ),
    [projection.results.rows, projection.results.state, spoilerSafe],
  );

  const filtered = useMemo(
    () =>
      projection.participants.filter((participant) => {
        if (filter !== "all" && participant.participationStatus !== filter) return false;
        if (!normalizedQuery) return true;
        return `${participant.name} ${participant.shortCode}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      }),
    [filter, normalizedQuery, projection.participants],
  );

  const grouped = useMemo(() => {
    const statuses: readonly V3EditionParticipant["participationStatus"][] = [
      "confirmed",
      "withdrawn",
      "disqualified",
    ];
    return statuses
      .map((status) => ({
        status,
        label: statusLabel(status),
        rows: filtered.filter((participant) => participant.participationStatus === status),
      }))
      .filter((group) => group.rows.length > 0);
  }, [filtered]);

  const editionMeta = [
    projection.hub.hero.hostLabel,
    projection.hub.hero.year?.toString(),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <V3Screen>
      <Link
        to={v3EditionOverviewHref(projection.hub.hero.href) as any}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Edition overview
      </Link>

      <V3ScreenHeader
        kicker="Edition · Participants"
        title={projection.hub.hero.name}
        description={`${projection.participants.length} public delegations${editionMeta ? ` · ${editionMeta}` : ""}`}
        editorial
      />

      <V3Surface level="raised" className="p-4">
        <label className="relative block">
          <span className="sr-only">Find a delegation</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/38"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            placeholder="Find a delegation"
            className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/32 focus:border-white/25 focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label="Filter participants by status"
        >
          {FILTERS.map((option) => {
            const active = filter === option.value;
            const count =
              option.value === "all"
                ? projection.participants.length
                : projection.participants.filter(
                    (participant) => participant.participationStatus === option.value,
                  ).length;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(option.value)}
                className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                  active
                    ? "border-white/20 bg-white/[0.11] text-white"
                    : "border-white/[0.07] bg-white/[0.025] text-white/52 hover:bg-white/[0.06] hover:text-white/78"
                }`}
              >
                {option.label} · {count}
              </button>
            );
          })}
        </div>
      </V3Surface>

      <p className="px-1 text-xs leading-5 text-white/45" aria-live="polite">
        {filtered.length} delegation{filtered.length === 1 ? "" : "s"} shown
        {spoilerSafe ? " · result placements hidden by spoiler-free mode" : ""}.
      </p>

      {grouped.length ? (
        grouped.map((group) => (
          <V3Section
            key={group.status}
            title={group.label}
            meta={`${group.rows.length}`}
          >
            <V3Surface level="raised" className="px-4">
              {group.rows.map((participant) => (
                <ParticipantRow
                  key={participant.id}
                  participant={participant}
                  result={resultByIdentity.get(participant.id) ?? null}
                />
              ))}
            </V3Surface>
          </V3Section>
        ))
      ) : (
        <V3Surface className="p-5">
          <p className="text-sm font-semibold">No matching delegation</p>
          <p className="mt-1 text-xs leading-5 text-white/48">
            Change the search or participation-state filter.
          </p>
        </V3Surface>
      )}
    </V3Screen>
  );
}

import { useMemo, useState } from "react";

import {
  matchVoterKey,
  resolveShowVoters,
  type Country,
  type JuryVote,
  type Participant,
  type Televote,
  type Voter,
  type VoterOption,
} from "@/lib/data";
import { cn } from "@/lib/utils";

type Direction = "received" | "given";
type Layer = "combined" | "jury" | "televote";

type Props = {
  participants: Participant[];
  countries: Map<string, Country>;
  jury: JuryVote[];
  televote: Televote[];
  voters?: Voter[];
};

type CircleItem = {
  key: string;
  name: string;
  code: string | null;
  flag: string | null;
  accent: string;
  points: number;
  kind: "jury" | "televote";
};

export function RadialPointsView({
  participants,
  countries,
  jury,
  televote,
  voters,
}: Props) {
  const participantIds = useMemo(
    () => participants.map((p) => p.country_id),
    [participants],
  );

  const participantOptions = useMemo(
    () =>
      participantIds
        .map((id) => countries.get(id))
        .filter((c): c is Country => !!c),
    [participantIds, countries],
  );

  const voterOptions = useMemo(
    () =>
      resolveShowVoters(
        voters,
        participantIds,
        [...countries.values()],
      ),
    [voters, participantIds, countries],
  );

  const [direction, setDirection] = useState<Direction>("received");
  const [layer, setLayer] = useState<Layer>("combined");
  const [selectedCountryId, setSelectedCountryId] = useState(
    participantIds[0] ?? "",
  );
  const [selectedVoterKey, setSelectedVoterKey] = useState(
    voterOptions[0]?.key ?? "",
  );

  const selectedCountry = countries.get(selectedCountryId) ?? null;
  const selectedVoter =
    voterOptions.find((v) => v.key === selectedVoterKey) ?? null;

  const juryItemsReceived = useMemo<CircleItem[]>(() => {
    if (!selectedCountryId) return [];

    return voterOptions
      .map((voter) => {
        const points = jury
          .filter(
            (vote) =>
              vote.receiving_country_id === selectedCountryId &&
              matchVoterKey(vote, voterOptions) === voter.key,
          )
          .reduce((sum, vote) => sum + vote.points, 0);

        return {
          key: voter.key,
          name: voter.name,
          code: voter.short_code,
          flag: voter.flag_image,
          accent: voter.accent_color,
          points,
          kind: "jury" as const,
        };
      })
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [selectedCountryId, jury, voterOptions]);

  const juryItemsGiven = useMemo<CircleItem[]>(() => {
    if (!selectedVoter) return [];

    return participantOptions
      .map((country) => {
        const points = jury
          .filter(
            (vote) =>
              vote.receiving_country_id === country.id &&
              matchVoterKey(vote, voterOptions) === selectedVoter.key,
          )
          .reduce((sum, vote) => sum + vote.points, 0);

        return {
          key: country.id,
          name: country.name,
          code: country.short_code,
          flag: country.flag_image,
          accent: country.accent_color,
          points,
          kind: "jury" as const,
        };
      })
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [selectedVoter, participantOptions, jury, voterOptions]);

  const teleTotal = useMemo(() => {
    if (!selectedCountryId) return 0;
    return televote
      .filter((vote) => vote.country_id === selectedCountryId)
      .reduce((sum, vote) => sum + vote.points, 0);
  }, [selectedCountryId, televote]);

  const circleItems = direction === "received" ? juryItemsReceived : juryItemsGiven;

  const visibleItems = useMemo(() => {
    if (direction === "given") return circleItems;

    if (layer === "televote") return [];

    return circleItems;
  }, [circleItems, direction, layer]);

  const juryTotal = useMemo(
    () => circleItems.reduce((sum, item) => sum + item.points, 0),
    [circleItems],
  );

  const total =
    direction === "received"
      ? (layer === "jury"
          ? juryTotal
          : layer === "televote"
            ? teleTotal
            : juryTotal + teleTotal)
      : juryTotal;

  const centerName =
    direction === "received"
      ? selectedCountry?.name ?? "Country"
      : selectedVoter?.name ?? "Voter";

  const centerFlag =
    direction === "received"
      ? selectedCountry?.flag_image ?? null
      : selectedVoter?.flag_image ?? null;

  const centerAccent =
    direction === "received"
      ? selectedCountry?.accent_color ?? "#7aaec4"
      : selectedVoter?.accent_color ?? "#7aaec4";

  const centerCode =
    direction === "received"
      ? selectedCountry?.short_code ?? ""
      : selectedVoter?.short_code ?? "";

  const angleOffset = -90;
  const radius = 42;

  return (
    <div className="space-y-4">
      <div className="glass p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Direction
              </span>
              <select
                value={direction}
                onChange={(e) => {
                  const next = e.target.value as Direction;
                  setDirection(next);
                  if (next === "given" && layer === "televote") {
                    setLayer("jury");
                  }
                }}
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
              >
                <option value="received">Points received</option>
                <option value="given">Points given</option>
              </select>
            </label>

            {direction === "received" ? (
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Country
                </span>
                <select
                  value={selectedCountryId}
                  onChange={(e) => setSelectedCountryId(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  {participantOptions.map((country) => (
                    <option key={country.id} value={country.id}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Jury
                </span>
                <select
                  value={selectedVoterKey}
                  onChange={(e) => setSelectedVoterKey(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
                >
                  {voterOptions.map((voter) => (
                    <option key={voter.key} value={voter.key}>
                      {voter.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div className="flex flex-wrap gap-1 rounded-xl bg-surface p-1">
            {(["combined", "jury", "televote"] as Layer[]).map((value) => {
              const disabled = direction === "given" && value !== "jury";
              const label =
                value === "combined"
                  ? "Combined"
                  : value === "jury"
                    ? "Jury"
                    : "Televote";

              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setLayer(value)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-medium",
                    layer === value
                      ? "bg-surface-strong text-foreground"
                      : "text-muted-foreground",
                    disabled && "cursor-not-allowed opacity-35",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {direction === "given" && (
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Detailed televote-by-country is intentionally unavailable. “Points given”
            therefore shows jury ballots only.
          </p>
        )}
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[760px] overflow-hidden rounded-[2rem] border border-border/70 bg-black/20 shadow-2xl">
        <div
          className="absolute inset-[8%] rounded-full opacity-50"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--primary) 18%, transparent) 0%, transparent 62%)",
          }}
        />

        <div className="absolute inset-0">
          {visibleItems.map((item, index) => {
            const count = Math.max(visibleItems.length, 1);
            const angle = angleOffset + (360 / count) * index;
            const radians = (angle * Math.PI) / 180;
            const x = 50 + Math.cos(radians) * radius;
            const y = 50 + Math.sin(radians) * radius;

            return (
              <button
                key={item.key}
                type="button"
                title={`${item.name}: ${item.points} points`}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${x}%`, top: `${y}%` }}
                onClick={() => {
                  if (direction === "received") {
                    setSelectedVoterKey(item.key);
                    setDirection("given");
                    setLayer("jury");
                  } else if (countries.has(item.key)) {
                    setSelectedCountryId(item.key);
                    setDirection("received");
                  }
                }}
              >
                <CircleFlag item={item} />
              </button>
            );
          })}
        </div>

        <ArrowRing count={Math.max(visibleItems.length, 12)} inward={direction === "received"} />

        {direction === "received" && layer !== "jury" && (
          <div className="absolute left-1/2 top-[9%] z-20 -translate-x-1/2">
            <div className="rounded-full border border-fuchsia-300/50 bg-fuchsia-500/80 px-4 py-2 text-center shadow-[0_0_24px_rgba(232,71,255,.45)] backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
                Tele
              </p>
              <p className="numeric text-lg font-bold text-white">{teleTotal}</p>
            </div>
          </div>
        )}

        <div className="absolute left-1/2 top-1/2 z-30 w-[34%] min-w-[128px] max-w-[230px] -translate-x-1/2 -translate-y-1/2">
          <button
            type="button"
            className="glass w-full rounded-full p-3 text-center sm:p-5"
            onClick={() => {
              if (direction === "given" && selectedVoter?.countryId) {
                setSelectedCountryId(selectedVoter.countryId);
                setDirection("received");
              }
            }}
          >
            <div
              className="mx-auto grid aspect-square w-[62%] place-items-center overflow-hidden rounded-full border border-white/25 shadow-lg"
              style={{
                backgroundColor: `${centerAccent}33`,
              }}
            >
              {centerFlag ? (
                <img
                  src={centerFlag}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="font-display text-lg font-bold">{centerCode || "?"}</span>
              )}
            </div>

            <p className="mt-3 truncate font-display text-base font-bold sm:text-xl">
              {centerName}
            </p>
            <p className="numeric mt-1 text-xs text-muted-foreground sm:text-sm">
              {total} point{total === 1 ? "" : "s"}
            </p>

            {direction === "received" && layer === "combined" && (
              <p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">
                Jury {juryTotal} · Tele {teleTotal}
              </p>
            )}
          </button>
        </div>

        {!visibleItems.length && layer === "televote" && (
          <div className="absolute inset-x-4 bottom-[10%] text-center text-xs text-muted-foreground">
            Televote is stored as one aggregate result in Solaris Studio, so there are
            no fake country-by-country televote bubbles.
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <LegendDot className="bg-[var(--jury)]" label="Juries" />
        <LegendDot className="bg-fuchsia-500" label="Televote total" />
        <span>Tap an outer flag to switch perspective.</span>
      </div>
    </div>
  );
}

function CircleFlag({ item }: { item: CircleItem }) {
  return (
    <div className="relative">
      <div
        className="h-10 w-10 overflow-hidden rounded-full border border-white/40 shadow-lg sm:h-12 sm:w-12 md:h-14 md:w-14"
        style={{ backgroundColor: `${item.accent}55` }}
      >
        {item.flag ? (
          <img src={item.flag} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[9px] font-bold text-white">
            {item.code ?? "J"}
          </div>
        )}
      </div>
      <span className="numeric absolute -bottom-1 -right-1 grid min-h-5 min-w-5 place-items-center rounded-full border border-white/30 bg-[#30105e]/90 px-1 text-[10px] font-bold text-white shadow-md sm:text-xs">
        {item.points}
      </span>
    </div>
  );
}

function ArrowRing({ count, inward }: { count: number; inward: boolean }) {
  const arrows = Array.from({ length: Math.min(Math.max(count, 12), 24) });
  return (
    <div className="pointer-events-none absolute inset-[28%] rounded-full">
      {arrows.map((_, index) => {
        const angle = -90 + (360 / arrows.length) * index;
        return (
          <span
            key={index}
            className="absolute left-1/2 top-1/2 text-lg text-primary/55 sm:text-2xl"
            style={{
              transform: `rotate(${angle}deg) translateY(-125%) rotate(${inward ? 90 : -90}deg)`,
              transformOrigin: "0 0",
            }}
          >
            →
          </span>
        );
      })}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

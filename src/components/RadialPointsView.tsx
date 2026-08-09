import { useEffect, useMemo, useState } from "react";

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

type CircleItem = {
  key: string;
  kind: "jury" | "televote";
  name: string;
  code: string | null;
  flag: string | null;
  accent: string;
  points: number;
  voterId?: string | null;
  countryId?: string | null;
};

type Props = {
  participants: Participant[];
  countries: Map<string, Country>;
  jury: JuryVote[];
  televote: Televote[];
  voters?: Voter[];
};

export function RadialPointsView({
  participants,
  countries,
  jury,
  televote,
  voters,
}: Props) {
  const participantIds = useMemo(
    () =>
      [...new Set(participants.map((participant) => participant.country_id).filter(Boolean))],
    [participants],
  );

  const participantOptions = useMemo(
    () =>
      participantIds
        .map((id) => countries.get(id))
        .filter((country): country is Country => !!country),
    [participantIds, countries],
  );

  const voterOptions = useMemo(
    () => resolveShowVoters(voters, participantIds, [...countries.values()]),
    [voters, participantIds, countries],
  );

  const [direction, setDirection] = useState<Direction>("received");
  const [layer, setLayer] = useState<Layer>("combined");
  const [selectedCountryId, setSelectedCountryId] = useState("");
  const [selectedVoterKey, setSelectedVoterKey] = useState("");

  useEffect(() => {
    if (!selectedCountryId || !participantIds.includes(selectedCountryId)) {
      setSelectedCountryId(participantIds[0] ?? "");
    }
  }, [participantIds, selectedCountryId]);

  useEffect(() => {
    if (!selectedVoterKey || !voterOptions.some((voter) => voter.key === selectedVoterKey)) {
      setSelectedVoterKey(voterOptions[0]?.key ?? "");
    }
  }, [voterOptions, selectedVoterKey]);

  const selectedCountry = countries.get(selectedCountryId) ?? null;
  const selectedVoter = voterOptions.find((voter) => voter.key === selectedVoterKey) ?? null;

  const voterById = useMemo(
    () => new Map((voters ?? []).map((voter) => [voter.id, voter])),
    [voters],
  );

  const voterOptionByKey = useMemo(
    () => new Map(voterOptions.map((option) => [option.key, option])),
    [voterOptions],
  );

  const voterOptionByVoterId = useMemo(() => {
    const map = new Map<string, VoterOption>();
    voterOptions.forEach((option) => {
      if (option.voterId) map.set(option.voterId, option);
    });
    return map;
  }, [voterOptions]);

  const voterOptionByCountryId = useMemo(() => {
    const map = new Map<string, VoterOption>();
    voterOptions.forEach((option) => {
      if (option.countryId) map.set(option.countryId, option);
    });
    return map;
  }, [voterOptions]);

  const juryItemsReceived = useMemo<CircleItem[]>(() => {
    if (!selectedCountryId) return [];

    const relevantVotes = jury.filter(
      (vote) => vote.receiving_country_id === selectedCountryId && vote.points > 0,
    );

    const grouped = new Map<
      string,
      {
        points: number;
        votes: JuryVote[];
      }
    >();

    relevantVotes.forEach((vote) => {
      const canonicalKey = matchVoterKey(vote, voterOptions);

      const fallbackKey = vote.voter_id
        ? `v:${vote.voter_id}`
        : vote.voter_country_id
          ? `c:${vote.voter_country_id}`
          : vote.voter_entity_id
            ? `e:${vote.voter_entity_id}`
            : `unknown:${vote.id}`;

      const key = canonicalKey || fallbackKey;

      const current = grouped.get(key) ?? { points: 0, votes: [] };
      current.points += vote.points;
      current.votes.push(vote);
      grouped.set(key, current);
    });

    return [...grouped.entries()]
      .map(([key, group]) => {
        const sample = group.votes[0];
        const meta = resolveVoteMetadata({
          key,
          vote: sample,
          voterOptionByKey,
          voterOptionByVoterId,
          voterOptionByCountryId,
          voterById,
          countries,
        });

        return {
          key,
          kind: "jury" as const,
          ...meta,
          points: group.points,
        };
      })
      .filter((item) => item.points > 0)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [
    selectedCountryId,
    jury,
    voterOptions,
    voterOptionByKey,
    voterOptionByVoterId,
    voterOptionByCountryId,
    voterById,
    countries,
  ]);

  const juryItemsGiven = useMemo<CircleItem[]>(() => {
    if (!selectedVoter) return [];

    const relevantVotes = jury.filter(
      (vote) => matchVoteToSelectedVoter(vote, selectedVoter, voterOptions) && vote.points > 0,
    );

    const grouped = new Map<string, number>();

    relevantVotes.forEach((vote) => {
      const recipientId = vote.receiving_country_id;
      if (!recipientId) return;
      grouped.set(recipientId, (grouped.get(recipientId) ?? 0) + vote.points);
    });

    return [...grouped.entries()]
      .map(([countryId, points]) => {
        const country = countries.get(countryId);

        return {
          key: countryId,
          kind: "jury" as const,
          name: country?.name ?? "Unknown country",
          code: country?.short_code ?? null,
          flag: country?.flag_image ?? null,
          accent: country?.accent_color ?? "#75a9bd",
          countryId,
          points,
        };
      })
      .filter((item) => item.points > 0)
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [selectedVoter, jury, voterOptions, countries]);

  const teleTotal = useMemo(() => {
    if (!selectedCountryId) return 0;

    return televote
      .filter((vote) => vote.country_id === selectedCountryId)
      .reduce((sum, vote) => sum + vote.points, 0);
  }, [selectedCountryId, televote]);

  const televoteCircleItem = useMemo<CircleItem | null>(() => {
    if (!selectedCountryId || teleTotal <= 0) return null;

    return {
      key: `tele:${selectedCountryId}`,
      kind: "televote",
      name: "Televote",
      code: "TELE",
      flag: null,
      accent: "#d946ef",
      points: teleTotal,
      countryId: selectedCountryId,
      voterId: null,
    };
  }, [selectedCountryId, teleTotal]);

  const baseCircleItems = direction === "received" ? juryItemsReceived : juryItemsGiven;

  const visibleItems = useMemo(() => {
    if (direction === "given") return baseCircleItems;

    if (layer === "jury") return baseCircleItems;

    if (layer === "televote") return televoteCircleItem ? [televoteCircleItem] : [];

    const combined = [...baseCircleItems];
    if (televoteCircleItem) combined.unshift(televoteCircleItem);
    return combined;
  }, [direction, layer, baseCircleItems, televoteCircleItem]);

  const juryTotal = useMemo(
    () => baseCircleItems.reduce((sum, item) => sum + item.points, 0),
    [baseCircleItems],
  );

  const total =
    direction === "received"
      ? layer === "jury"
        ? juryTotal
        : layer === "televote"
          ? teleTotal
          : juryTotal + teleTotal
      : juryTotal;

  const centerName = direction === "received" ? selectedCountry?.name ?? "Country" : selectedVoter?.name ?? "Jury";

  const centerFlag = direction === "received" ? selectedCountry?.flag_image ?? null : selectedVoter?.flag_image ?? null;

  const centerAccent =
    direction === "received"
      ? selectedCountry?.accent_color ?? "#75a9bd"
      : selectedVoter?.accent_color ?? "#75a9bd";

  const centerCode = direction === "received" ? selectedCountry?.short_code ?? "" : selectedVoter?.short_code ?? "";

  const radius =
    visibleItems.length <= 1
      ? 36
      : visibleItems.length <= 8
        ? 36
        : visibleItems.length <= 12
          ? 38
          : visibleItems.length <= 18
            ? 40
            : 41;

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
                onChange={(event) => {
                  const next = event.target.value as Direction;
                  setDirection(next);

                  if (next === "given") {
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
                  onChange={(event) => setSelectedCountryId(event.target.value)}
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
                  onChange={(event) => setSelectedVoterKey(event.target.value)}
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

          {direction === "received" && (
            <div className="flex flex-wrap gap-1 rounded-xl bg-surface p-1">
              {(["combined", "jury", "televote"] as Layer[]).map((value) => {
                const label =
                  value === "combined" ? "Combined" : value === "jury" ? "Jury" : "Televote";

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLayer(value)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                      layer === value
                        ? "bg-surface-strong text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[760px] overflow-hidden rounded-[2rem] border border-border/70 bg-black/20 shadow-2xl">
        <div
          className="absolute inset-[7%] rounded-full opacity-60"
          style={{
            background: `
              radial-gradient(
                circle,
                color-mix(in oklab, var(--primary) 18%, transparent) 0%,
                transparent 65%
              )
            `,
          }}
        />

        <div className="absolute inset-0">
          {visibleItems.map((item, index) => {
            const count = visibleItems.length || 1;
            const angle = -90 + (360 / count) * index;
            const radians = (angle * Math.PI) / 180;
            const x = 50 + Math.cos(radians) * radius;
            const y = 50 + Math.sin(radians) * radius;

            return (
              <button
                key={item.key}
                type="button"
                title={`${item.name}: ${item.points} points`}
                className="absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-transform active:scale-95"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                }}
                onClick={() => {
                  if (item.kind === "televote") return;

                  if (direction === "received") {
                    const matching = findMatchingVoterOption(item, voterOptions);

                    if (matching) {
                      setSelectedVoterKey(matching.key);
                      setDirection("given");
                      setLayer("jury");
                    }

                    return;
                  }

                  if (item.countryId) {
                    setSelectedCountryId(item.countryId);
                    setDirection("received");
                    setLayer("combined");
                  }
                }}
              >
                <CircleFlag item={item} />
              </button>
            );
          })}
        </div>

        {visibleItems.length > 0 && (
          <ArrowRing
            count={visibleItems.length}
            inward={direction === "received"}
          />
        )}

        <div className="absolute left-1/2 top-1/2 z-30 w-[38%] min-w-[132px] max-w-[235px] -translate-x-1/2 -translate-y-1/2">
          <div className="glass w-full rounded-[2rem] p-4 text-center sm:p-5">
            <div
              className="mx-auto grid aspect-square w-[58%] place-items-center overflow-hidden rounded-full border border-white/30 shadow-xl"
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
                <span className="font-display text-lg font-bold">
                  {centerCode || "?"}
                </span>
              )}
            </div>

            <p className="mt-3 truncate font-display text-base font-bold sm:text-xl">
              {centerName}
            </p>

            <p className="numeric mt-1 text-sm font-semibold text-foreground">
              {total} point{total === 1 ? "" : "s"}
            </p>

            {direction === "received" && layer === "combined" && (
              <p className="mt-1 text-[10px] text-muted-foreground sm:text-xs">
                Jury {juryTotal} · Tele {teleTotal}
              </p>
            )}
          </div>
        </div>

        {direction === "received" && layer === "televote" && visibleItems.length === 0 && (
          <div className="absolute inset-x-6 bottom-[8%] text-center">
            <p className="mx-auto max-w-sm text-[11px] leading-relaxed text-muted-foreground">
              No televote total is stored for this country in this round.
            </p>
          </div>
        )}

        {direction === "received" && layer !== "televote" && visibleItems.length === 0 && (
          <div className="absolute inset-x-6 bottom-[8%] text-center">
            <p className="text-xs text-muted-foreground">
              No individual jury votes are stored for this country in this round.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
        <LegendDot className="bg-[var(--jury)]" label="Jury points" />

        {direction === "received" && (
          <LegendDot className="bg-fuchsia-500" label="Televote total" />
        )}

        <span>
          {direction === "received" && layer === "combined"
            ? "Juries that awarded points plus one televote circle are shown."
            : direction === "received" && layer === "televote"
              ? "Only the aggregate televote circle is shown."
              : "Only juries that awarded points are shown."}
        </span>
      </div>
    </div>
  );
}

function resolveVoteMetadata({
  key,
  vote,
  voterOptionByKey,
  voterOptionByVoterId,
  voterOptionByCountryId,
  voterById,
  countries,
}: {
  key: string;
  vote: JuryVote;
  voterOptionByKey: Map<string, VoterOption>;
  voterOptionByVoterId: Map<string, VoterOption>;
  voterOptionByCountryId: Map<string, VoterOption>;
  voterById: Map<string, Voter>;
  countries: Map<string, Country>;
}): Omit<CircleItem, "key" | "points" | "kind"> {
  const byKey = voterOptionByKey.get(key);

  if (byKey) {
    return {
      name: byKey.name,
      code: byKey.short_code,
      flag: byKey.flag_image,
      accent: byKey.accent_color || "#75a9bd",
      voterId: byKey.voterId,
      countryId: byKey.countryId,
    };
  }

  if (vote.voter_id) {
    const option = voterOptionByVoterId.get(vote.voter_id);

    if (option) {
      return {
        name: option.name,
        code: option.short_code,
        flag: option.flag_image,
        accent: option.accent_color || "#75a9bd",
        voterId: option.voterId,
        countryId: option.countryId,
      };
    }

    const voter = voterById.get(vote.voter_id);

    if (voter) {
      const country = voter.country_id ? countries.get(voter.country_id) : undefined;

      return {
        name: voter.name || country?.name || "Jury",
        code: country?.short_code ?? null,
        flag: voter.flag_image ?? country?.flag_image ?? null,
        accent: voter.accent_color || country?.accent_color || "#75a9bd",
        voterId: voter.id,
        countryId: voter.country_id ?? null,
      };
    }
  }

  if (vote.voter_country_id) {
    const option = voterOptionByCountryId.get(vote.voter_country_id);

    if (option) {
      return {
        name: option.name,
        code: option.short_code,
        flag: option.flag_image,
        accent: option.accent_color || "#75a9bd",
        voterId: option.voterId,
        countryId: option.countryId,
      };
    }

    const country = countries.get(vote.voter_country_id);

    if (country) {
      return {
        name: country.name,
        code: country.short_code,
        flag: country.flag_image,
        accent: country.accent_color || "#75a9bd",
        voterId: null,
        countryId: country.id,
      };
    }
  }

  if (vote.voter_entity_id) {
    const option = voterOptionByCountryId.get(vote.voter_entity_id);

    if (option) {
      return {
        name: option.name,
        code: option.short_code,
        flag: option.flag_image,
        accent: option.accent_color || "#75a9bd",
        voterId: option.voterId,
        countryId: option.countryId,
      };
    }
  }

  return {
    name: "Jury",
    code: null,
    flag: null,
    accent: "#75a9bd",
    voterId: vote.voter_id ?? null,
    countryId: vote.voter_country_id || vote.voter_entity_id || null,
  };
}

function matchVoteToSelectedVoter(
  vote: JuryVote,
  selected: VoterOption,
  options: VoterOption[],
) {
  const canonical = matchVoterKey(vote, options);

  if (canonical === selected.key) return true;

  if (vote.voter_id && selected.voterId && vote.voter_id === selected.voterId) return true;

  if (
    vote.voter_country_id &&
    selected.countryId &&
    vote.voter_country_id === selected.countryId
  ) {
    return true;
  }

  if (
    vote.voter_entity_id &&
    selected.countryId &&
    vote.voter_entity_id === selected.countryId
  ) {
    return true;
  }

  return false;
}

function findMatchingVoterOption(item: CircleItem, options: VoterOption[]) {
  const byKey = options.find((option) => option.key === item.key);
  if (byKey) return byKey;

  if (item.voterId) {
    const byVoter = options.find((option) => option.voterId === item.voterId);
    if (byVoter) return byVoter;
  }

  if (item.countryId) {
    return options.find((option) => option.countryId === item.countryId) ?? null;
  }

  return null;
}

function CircleFlag({ item }: { item: CircleItem }) {
  if (item.kind === "televote") {
    return (
      <div className="relative flex flex-col items-center">
        <div className="relative flex h-12 w-12 flex-col items-center justify-center overflow-hidden rounded-full border border-fuchsia-200/60 bg-fuchsia-500/90 shadow-[0_4px_18px_rgba(217,70,239,.45)] sm:h-14 sm:w-14 md:h-16 md:w-16">
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-black/10" />
          <div className="relative z-10 text-center leading-none">
            <div className="text-[8px] font-black uppercase tracking-[0.14em] text-white sm:text-[9px]">
              TELE
            </div>
            <div className="numeric mt-1 text-[16px] font-black text-white [text-shadow:0_2px_5px_rgba(0,0,0,1)] sm:text-[18px] md:text-[20px]">
              {item.points}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center">
      <div
        className="relative h-12 w-12 overflow-hidden rounded-full border border-white/45 shadow-[0_4px_18px_rgba(0,0,0,.35)] sm:h-14 sm:w-14 md:h-16 md:w-16"
        style={{
          backgroundColor: `${item.accent}55`,
        }}
      >
        {item.flag ? (
          <img
            src={item.flag}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-[9px] font-black text-white">
            {item.code ?? "J"}
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

        <div className="numeric absolute inset-x-0 bottom-[3px] z-10 text-center text-[17px] font-black leading-none text-white [text-shadow:0_2px_5px_rgba(0,0,0,1)] sm:text-[19px] md:text-[21px]">
          {item.points}
        </div>
      </div>
    </div>
  );
}

function ArrowRing({
  count,
  inward,
}: {
  count: number;
  inward: boolean;
}) {
  const arrowCount = Math.min(Math.max(Math.ceil(count / 2), 7), 12);
  const arrows = Array.from({ length: arrowCount });

  return (
    <div className="pointer-events-none absolute inset-[27%] rounded-full">
      {arrows.map((_, index) => {
        const angle = -90 + (360 / arrows.length) * index;

        return (
          <span
            key={index}
            className="absolute left-1/2 top-1/2 text-xl font-light text-primary/40 sm:text-2xl"
            style={{
              transform:
                `rotate(${angle}deg) translateY(-135%) rotate(${inward ? 90 : -90}deg)`,
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

function LegendDot({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

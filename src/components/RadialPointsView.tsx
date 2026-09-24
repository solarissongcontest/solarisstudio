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

  const circleCount = visibleItems.length;
  const ringRadius =
    circleCount <= 8
      ? 37
      : circleCount <= 16
        ? 40
        : circleCount <= 26
          ? 42.5
          : circleCount <= 36
            ? 44
            : 45;
  const nodePercent = Math.min(
    14,
    Math.max(6.4, 255 / Math.max(circleCount, 1)),
  );
  const centerPercent = circleCount > 32 ? 27 : circleCount > 22 ? 30 : 33;
  const topJuryAward = Math.max(0, ...baseCircleItems.map((item) => item.points));

  const toggleCenterDirection = () => {
    if (direction === "received") {
      const matching = voterOptions.find(
        (option) => option.countryId === selectedCountryId,
      );

      if (matching) {
        setSelectedVoterKey(matching.key);
        setDirection("given");
        setLayer("jury");
      }

      return;
    }

    if (selectedVoter?.countryId) {
      setSelectedCountryId(selectedVoter.countryId);
      setDirection("received");
      setLayer("combined");
    }
  };

  const centerCanToggle =
    direction === "received"
      ? voterOptions.some((option) => option.countryId === selectedCountryId)
      : Boolean(selectedVoter?.countryId);

  return (
    <div className="space-y-4" data-points-explorer-circle>
      <section className="rounded-[1.35rem] border border-border/70 bg-surface/40 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                Points explorer
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tap a voter around the circle to follow its ballot.
              </p>
            </div>

            <div className="grid grid-cols-2 rounded-xl border border-border/70 bg-background/35 p-1">
              {([
                ["received", "Received"],
                ["given", "Given"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={direction === value}
                  onClick={() => {
                    setDirection(value);
                    if (value === "given") setLayer("jury");
                  }}
                  className={cn(
                    "min-h-9 rounded-lg px-3 text-xs font-semibold transition-colors",
                    direction === value
                      ? "bg-surface-strong text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="min-w-0">
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {direction === "received" ? "Country" : "Jury"}
              </span>
              <select
                value={direction === "received" ? selectedCountryId : selectedVoterKey}
                onChange={(event) => {
                  if (direction === "received") {
                    setSelectedCountryId(event.target.value);
                  } else {
                    setSelectedVoterKey(event.target.value);
                  }
                }}
                className="min-h-11 w-full rounded-xl border border-border bg-background/45 px-3 text-sm outline-none focus:border-primary/50"
              >
                {(direction === "received" ? participantOptions : voterOptions).map((option) => (
                  <option
                    key={direction === "received" ? (option as Country).id : (option as VoterOption).key}
                    value={direction === "received" ? (option as Country).id : (option as VoterOption).key}
                  >
                    {option.name}
                  </option>
                ))}
              </select>
            </label>

            {direction === "received" ? (
              <div className="grid grid-cols-3 rounded-xl border border-border/70 bg-background/35 p-1">
                {(["combined", "jury", "televote"] as Layer[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={layer === value}
                    onClick={() => setLayer(value)}
                    className={cn(
                      "min-h-9 rounded-lg px-2 text-[11px] font-semibold transition-colors sm:px-3 sm:text-xs",
                      layer === value
                        ? "bg-surface-strong text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {value === "combined" ? "Combined" : value === "jury" ? "Jury" : "Televote"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.65rem] border border-border/70 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_58%),linear-gradient(180deg,rgba(3,8,18,.62),rgba(3,8,18,.82))] shadow-2xl">
        <div className="relative mx-auto aspect-square w-full max-w-[820px]" data-points-circle-stage>
          <div className="absolute left-3 top-3 z-40 flex flex-col gap-1.5 text-[10px] sm:left-4 sm:top-4 sm:text-xs">
            {direction === "received" && layer !== "televote" ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-sky-300/20 bg-sky-500/10 px-2 py-1 font-semibold text-sky-100 backdrop-blur-sm">
                <span className="numeric">{juryTotal}</span>
                Jury
              </span>
            ) : null}
            {direction === "received" && layer !== "jury" ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-fuchsia-300/20 bg-fuchsia-500/10 px-2 py-1 font-semibold text-fuchsia-100 backdrop-blur-sm">
                <span className="numeric">{teleTotal}</span>
                Public
              </span>
            ) : null}
          </div>

          <div className="absolute inset-0">
            {visibleItems.map((item, index) => {
              const count = visibleItems.length || 1;
              const angle = -90 + (360 / count) * index;
              const radians = (angle * Math.PI) / 180;
              const x = 50 + Math.cos(radians) * ringRadius;
              const y = 50 + Math.sin(radians) * ringRadius;
              const topAward = item.kind === "jury" && topJuryAward > 0 && item.points === topJuryAward;

              return (
                <button
                  key={item.key}
                  type="button"
                  aria-label={`${item.name}: ${item.points} points`}
                  title={`${item.name}: ${item.points} points`}
                  className="absolute z-20 -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-95"
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    width: `${nodePercent}%`,
                    height: `${nodePercent}%`,
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
                  <CircleVoteNode item={item} topAward={topAward} />
                </button>
              );
            })}
          </div>

          {visibleItems.length > 0 ? (
            <ArrowRing
              count={visibleItems.length}
              inward={direction === "received"}
            />
          ) : null}

          <button
            type="button"
            disabled={!centerCanToggle}
            onClick={toggleCenterDirection}
            aria-label={centerCanToggle ? "Reverse points direction" : undefined}
            className={cn(
              "absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              centerCanToggle && "transition-transform hover:scale-[1.025] active:scale-[.985]",
            )}
            style={{
              width: `${centerPercent}%`,
              height: `${centerPercent}%`,
            }}
          >
            <div className="relative h-full w-full overflow-hidden rounded-full border border-white/25 bg-surface shadow-[0_18px_55px_rgba(0,0,0,.52)]">
              {centerFlag ? (
                <img
                  src={centerFlag}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div
                  className="absolute inset-0 grid place-items-center"
                  style={{ backgroundColor: `${centerAccent}66` }}
                >
                  <span className="font-display text-xl font-black text-white sm:text-3xl">
                    {centerCode || "?"}
                  </span>
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/15 to-black/85" />

              <div className="absolute inset-x-[7%] bottom-[10%] text-center text-white">
                <p className="numeric text-[clamp(16px,4.6vw,34px)] font-black leading-none [text-shadow:0_2px_8px_rgba(0,0,0,.9)]">
                  {total}
                </p>
                <p className="mt-1 truncate font-display text-[clamp(11px,3.3vw,22px)] font-bold leading-tight [text-shadow:0_2px_6px_rgba(0,0,0,.9)]">
                  {centerName}
                </p>
                <p className="mt-0.5 text-[clamp(7px,1.8vw,11px)] font-semibold uppercase tracking-[0.12em] text-white/75">
                  {direction === "received" ? "received" : "given"}
                </p>
              </div>
            </div>
          </button>

          {visibleItems.length === 0 ? (
            <div className="absolute inset-x-8 bottom-[9%] text-center">
              <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">
                {direction === "received" && layer === "televote"
                  ? "No televote total is stored for this country in this round."
                  : direction === "received"
                    ? "No individual jury votes are stored for this country in this round."
                    : "No published jury ballot is stored for this voter in this round."}
              </p>
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/8 px-4 py-3 text-center">
          <p className="text-[10px] leading-relaxed text-muted-foreground sm:text-xs">
            Tap an outer flag to follow that jury&apos;s points.
            {centerCanToggle ? " Tap the center to reverse the direction." : ""}
            {direction === "received" && layer !== "jury" ? " TELE is the aggregate public-vote total." : ""}
          </p>
        </div>
      </section>
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

function CircleVoteNode({
  item,
  topAward,
}: {
  item: CircleItem;
  topAward: boolean;
}) {
  if (item.kind === "televote") {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-full border border-fuchsia-200/70 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,.28),transparent_34%),linear-gradient(145deg,#e52bd4,#9f16c7)] shadow-[0_6px_22px_rgba(217,70,239,.42)]">
        <div className="absolute inset-0 grid place-items-center text-center text-white">
          <div>
            <div className="text-[clamp(6px,1.6vw,10px)] font-black uppercase tracking-[0.12em]">
              TELE
            </div>
            <div className="numeric mt-0.5 text-[clamp(12px,4vw,24px)] font-black leading-none [text-shadow:0_2px_5px_rgba(0,0,0,.75)]">
              {item.points}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-full border bg-black shadow-[0_5px_18px_rgba(0,0,0,.42)]",
        topAward ? "border-amber-300 ring-1 ring-amber-300/55" : "border-white/45",
      )}
      style={{ backgroundColor: `${item.accent}66` }}
    >
      {item.flag ? (
        <img src={item.flag} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-[9px] font-black text-white">
          {item.code ?? "J"}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/78" />
      <div className="numeric absolute inset-x-0 bottom-[8%] z-10 text-center text-[clamp(10px,3.6vw,22px)] font-black leading-none text-white [text-shadow:0_2px_5px_rgba(0,0,0,1)]">
        {item.points}
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

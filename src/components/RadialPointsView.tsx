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
  const [showAllContributors, setShowAllContributors] = useState(false);

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

  useEffect(() => {
    setShowAllContributors(false);
  }, [direction, layer, selectedCountryId, selectedVoterKey]);

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

  const juryContributors = visibleItems.filter((item) => item.kind === "jury");
  const televoteContribution = visibleItems.find((item) => item.kind === "televote") ?? null;
  const contributorLimit = 10;
  const visibleJuryContributors = showAllContributors
    ? juryContributors
    : juryContributors.slice(0, contributorLimit);
  const maxJuryPoints = Math.max(1, ...juryContributors.map((item) => item.points));
  const summaryLabel = direction === "received" ? "Points received" : "Points given";
  const contributorTitle = direction === "received" ? "Where the points came from" : "Where the points went";
  const contributorDescription =
    direction === "received"
      ? "Juries are ranked by the points they awarded. Tap a jury to inspect its full ballot."
      : "Recipients are ranked by the points this jury awarded. Tap a country to inspect the points it received.";

  const activateItem = (item: CircleItem) => {
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
  };

  return (
    <div className="space-y-4" data-points-explorer-v2>
      <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-surface/45 shadow-[0_18px_50px_-34px_rgba(0,0,0,.65)]">
        <div className="border-b border-border/60 p-3 sm:p-4">
          <div className="mb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
              Points explorer
            </p>
            <h3 className="mt-1 font-display text-lg font-bold sm:text-xl">
              Trace every published point
            </h3>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,.72fr)]">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Direction
                </span>
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
                        "min-h-10 rounded-lg px-3 text-xs font-semibold transition-colors",
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

              {direction === "received" ? (
                <label>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Country
                  </span>
                  <select
                    value={selectedCountryId}
                    onChange={(event) => setSelectedCountryId(event.target.value)}
                    className="min-h-12 w-full rounded-xl border border-border bg-background/45 px-3 text-sm outline-none focus:border-primary/55"
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
                    className="min-h-12 w-full rounded-xl border border-border bg-background/45 px-3 text-sm outline-none focus:border-primary/55"
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

            {direction === "received" ? (
              <div>
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Layer
                </span>
                <div className="grid grid-cols-3 rounded-xl border border-border/70 bg-background/35 p-1">
                  {(["combined", "jury", "televote"] as Layer[]).map((value) => {
                    const label =
                      value === "combined" ? "Combined" : value === "jury" ? "Jury" : "Televote";

                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={layer === value}
                        onClick={() => setLayer(value)}
                        className={cn(
                          "min-h-10 rounded-lg px-2 text-[11px] font-semibold transition-colors sm:text-xs",
                          layer === value
                            ? "bg-surface-strong text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(15rem,.8fr)] lg:items-center">
          <div className="flex min-w-0 items-center gap-4">
            <PointsFlag
              image={centerFlag}
              code={centerCode}
              accent={centerAccent}
              shape="rounded"
              size="lg"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                {summaryLabel}
              </p>
              <h4 className="mt-1 truncate font-display text-2xl font-bold sm:text-3xl">
                {centerName}
              </h4>
              <p className="numeric mt-1 text-lg font-black text-foreground">
                {total} point{total === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className={cn(
            "grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60",
            direction === "received" && layer === "combined" ? "grid-cols-2" : "grid-cols-1",
          )}>
            {direction === "received" && layer !== "televote" ? (
              <PointsStat label="Jury" value={juryTotal} />
            ) : null}
            {direction === "received" && layer !== "jury" ? (
              <PointsStat label="Televote" value={teleTotal} accent />
            ) : null}
            {direction === "given" ? (
              <PointsStat label="Jury total" value={juryTotal} />
            ) : null}
          </div>
        </div>
      </section>

      {direction === "received" && layer !== "jury" && televoteContribution ? (
        <section className="rounded-[1.35rem] border border-fuchsia-400/25 bg-fuchsia-500/[0.055] p-4">
          <div className="flex items-center gap-3">
            <PointsFlag image={null} code="TELE" accent="#d946ef" shape="circle" size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-fuchsia-300">
                Aggregate public vote
              </p>
              <p className="mt-0.5 text-sm font-semibold">Televote contribution</p>
            </div>
            <span className="numeric text-xl font-black text-fuchsia-200">
              {televoteContribution.points}
            </span>
          </div>
        </section>
      ) : null}

      {layer !== "televote" || direction === "given" ? (
        <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-surface/30">
          <header className="flex items-end justify-between gap-4 border-b border-border/60 p-4 sm:p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                Breakdown
              </p>
              <h4 className="mt-1 font-display text-xl font-bold sm:text-2xl">
                {contributorTitle}
              </h4>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {contributorDescription}
              </p>
            </div>
            <span className="numeric shrink-0 text-xs text-muted-foreground">
              {juryContributors.length} {juryContributors.length === 1 ? "jury" : "juries"}
            </span>
          </header>

          {visibleJuryContributors.length ? (
            <div className="divide-y divide-border/55">
              {visibleJuryContributors.map((item, index) => (
                <ContributionRow
                  key={item.key}
                  item={item}
                  rank={index + 1}
                  maxPoints={maxJuryPoints}
                  onActivate={() => activateItem(item)}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold">No individual jury points to show</p>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {direction === "received"
                  ? "No published jury ballots awarded points to this country in the selected round."
                  : "No published jury ballot is available for this voter in the selected round."}
              </p>
            </div>
          )}

          {juryContributors.length > contributorLimit ? (
            <div className="border-t border-border/60 p-3 text-center">
              <button
                type="button"
                onClick={() => setShowAllContributors((value) => !value)}
                className="min-h-10 rounded-xl border border-border bg-background/35 px-4 text-xs font-semibold transition hover:border-primary/45 hover:text-primary"
              >
                {showAllContributors
                  ? "Show top 10"
                  : `Show all ${juryContributors.length} contributors`}
              </button>
            </div>
          ) : null}
        </section>
      ) : direction === "received" && !televoteContribution ? (
        <div className="rounded-[1.5rem] border border-border/70 bg-surface/30 p-8 text-center">
          <p className="text-sm font-semibold">No televote total available</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
            No aggregate televote score is stored for this country in this round.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function PointsStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="bg-background/45 px-3 py-3 text-center">
      <p className={cn(
        "text-[9px] font-black uppercase tracking-[0.14em]",
        accent ? "text-fuchsia-300" : "text-muted-foreground",
      )}>
        {label}
      </p>
      <p className="numeric mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function ContributionRow({
  item,
  rank,
  maxPoints,
  onActivate,
}: {
  item: CircleItem;
  rank: number;
  maxPoints: number;
  onActivate: () => void;
}) {
  const percentage = Math.max(5, Math.min(100, (item.points / maxPoints) * 100));

  return (
    <button
      type="button"
      onClick={onActivate}
      title={`Open ${item.name} voting detail`}
      className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5"
    >
      <div className="relative">
        <PointsFlag
          image={item.flag}
          code={item.code ?? "J"}
          accent={item.accent}
          shape="circle"
          size="sm"
        />
        <span className="numeric absolute -bottom-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full border border-background bg-surface-strong px-1 text-[9px] font-black">
          {rank}
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{item.name}</p>
            <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              {item.code || "Jury"}
            </p>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/55">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="numeric text-lg font-black">{item.points}</span>
        <span className="text-sm text-primary transition-transform group-hover:translate-x-0.5" aria-hidden="true">
          →
        </span>
      </div>
    </button>
  );
}

function PointsFlag({
  image,
  code,
  accent,
  shape,
  size,
}: {
  image: string | null;
  code: string;
  accent: string;
  shape: "rounded" | "circle" | "square";
  size: "sm" | "md" | "lg";
}) {
  const dimensions = {
    sm: shape === "rounded" ? "h-10 w-[3.75rem]" : "h-10 w-10",
    md: shape === "rounded" ? "h-12 w-[4.5rem]" : "h-12 w-12",
    lg: shape === "rounded" ? "h-16 w-24 sm:h-20 sm:w-[7.5rem]" : "h-16 w-16 sm:h-20 sm:w-20",
  }[size];

  const radius =
    shape === "circle"
      ? "rounded-full"
      : shape === "square"
        ? "rounded-none"
        : "rounded-xl";

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden border border-white/20 shadow-[0_8px_24px_-14px_rgba(0,0,0,.9)]",
        dimensions,
        radius,
      )}
      style={{ backgroundColor: `${accent}33` }}
      data-points-flag-shape={shape}
    >
      {image ? (
        <img
          src={image}
          alt=""
          className="h-full w-full object-cover"
          style={{ objectPosition: "center" }}
        />
      ) : (
        <span className="text-[9px] font-black uppercase tracking-[0.12em] text-white">
          {code}
        </span>
      )}
    </span>
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
: {
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

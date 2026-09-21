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

export function PointsExplorerView({
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
  const contributorCountLabel =
    direction === "received"
      ? `${juryContributors.length} ${juryContributors.length === 1 ? "jury" : "juries"}`
      : `${juryContributors.length} ${juryContributors.length === 1 ? "country" : "countries"}`;

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
              {contributorCountLabel}
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

  const maxVisiblePoints = Math.max(
    1,
    ...visibleItems.map((item) => item.points),
  );
  const contributorLimit = 10;
  const displayedItems = showAllContributors
    ? visibleItems
    : visibleItems.slice(0, contributorLimit);
  const hiddenContributorCount = Math.max(0, visibleItems.length - displayedItems.length);
  const juryShare = total > 0 ? (juryTotal / total) * 100 : 0;
  const televoteShare = total > 0 ? (teleTotal / total) * 100 : 0;

  const openBreakdownItem = (item: CircleItem) => {
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
    <div className="space-y-4" data-points-explorer>
      <section className="rounded-[1.5rem] border border-border/70 bg-surface/35 p-3 shadow-sm sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[auto_minmax(14rem,1fr)_auto] lg:items-end">
          <div>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Direction
            </span>
            <div className="grid grid-cols-2 rounded-xl bg-background/45 p-1">
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
                    "min-h-10 rounded-lg px-3 text-sm font-semibold transition",
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

          <label className="min-w-0">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
              className="min-h-11 w-full rounded-xl border border-border bg-background/60 px-3 text-sm"
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
            <div>
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Layer
              </span>
              <div className="grid grid-cols-3 rounded-xl bg-background/45 p-1">
                {(["combined", "jury", "televote"] as Layer[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={layer === value}
                    onClick={() => setLayer(value)}
                    className={cn(
                      "min-h-10 rounded-lg px-3 text-xs font-semibold transition sm:text-sm",
                      layer === value
                        ? "bg-surface-strong text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {value === "combined" ? "Combined" : value === "jury" ? "Jury" : "Televote"}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-surface/28 shadow-xl">
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)] lg:gap-7">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <SubjectFlag
                src={centerFlag}
                name={centerName}
                code={centerCode}
                accent={centerAccent}
              />

              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {direction === "received" ? "Points received by" : "Points given by"}
                </p>
                <h3 className="mt-1 truncate font-display text-2xl font-bold sm:text-3xl">
                  {centerName}
                </h3>
                {centerCode ? (
                  <p className="mt-0.5 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {centerCode}
                  </p>
                ) : null}
              </div>
            </div>

            <div className={cn(
              "mt-5 grid gap-px overflow-hidden rounded-2xl border border-border/70 bg-border/60",
              direction === "received" ? "grid-cols-3" : "grid-cols-2",
            )}>
              <PointsStat label="Total" value={total} />
              <PointsStat label="Jury" value={juryTotal} />
              {direction === "received" ? <PointsStat label="Televote" value={teleTotal} /> : null}
              {direction === "given" ? <PointsStat label="Recipients" value={baseCircleItems.length} /> : null}
            </div>

            {direction === "received" && layer === "combined" ? (
              <div className="mt-5 rounded-2xl border border-border/70 bg-background/35 p-3">
                <div className="mb-2 flex items-center justify-between gap-4 text-xs">
                  <span className="font-semibold">Jury / televote split</span>
                  <span className="numeric text-muted-foreground">
                    {juryTotal} / {teleTotal}
                  </span>
                </div>
                <div
                  className="flex h-3 overflow-hidden rounded-full bg-background"
                  aria-label={`Jury ${Math.round(juryShare)} percent, televote ${Math.round(televoteShare)} percent`}
                >
                  <span
                    className="h-full bg-[var(--jury)] transition-[width]"
                    style={{ width: `${juryShare}%` }}
                  />
                  <span
                    className="h-full bg-fuchsia-500 transition-[width]"
                    style={{ width: `${televoteShare}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between gap-4 text-[10px] text-muted-foreground">
                  <span>{Math.round(juryShare)}% jury</span>
                  <span>{Math.round(televoteShare)}% televote</span>
                </div>
              </div>
            ) : null}

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {direction === "received"
                ? `${baseCircleItems.length} ${baseCircleItems.length === 1 ? "jury awarded" : "juries awarded"} points to this entry.`
                : `${baseCircleItems.length} ${baseCircleItems.length === 1 ? "recipient received" : "recipients received"} points from this jury.`}
            </p>
          </div>

          <div className="min-w-0 lg:border-l lg:border-border/70 lg:pl-7">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Breakdown
                </p>
                <h4 className="mt-1 text-lg font-bold">
                  {layer === "televote" ? "Public vote" : direction === "given" ? "Recipients" : "Contributors"}
                </h4>
              </div>
              <span className="numeric text-xs text-muted-foreground">
                {visibleItems.length}
              </span>
            </div>

            {displayedItems.length ? (
              <div className="mt-3 space-y-2">
                {displayedItems.map((item, index) => (
                  <PointSourceRow
                    key={item.key}
                    item={item}
                    rank={index + 1}
                    maxPoints={maxVisiblePoints}
                    onOpen={() => openBreakdownItem(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-border p-5 text-center">
                <p className="text-sm font-semibold">
                  {layer === "televote" ? "No televote total stored" : "No detailed jury points stored"}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  This round does not contain the detailed data needed for this breakdown.
                </p>
              </div>
            )}

            {hiddenContributorCount > 0 ? (
              <button
                type="button"
                onClick={() => setShowAllContributors(true)}
                className="mt-3 min-h-11 w-full rounded-xl border border-border bg-background/35 px-4 text-sm font-semibold transition hover:bg-surface"
              >
                Show all {visibleItems.length} contributors
              </button>
            ) : showAllContributors && visibleItems.length > contributorLimit ? (
              <button
                type="button"
                onClick={() => setShowAllContributors(false)}
                className="mt-3 min-h-11 w-full rounded-xl border border-border bg-background/35 px-4 text-sm font-semibold transition hover:bg-surface"
              >
                Show fewer
              </button>
            ) : null}

            {displayedItems.some((item) => item.kind === "jury") ? (
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Tap a jury to inspect the points it gave. In “Points given”, tap a recipient to jump back to its received breakdown.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function PointsStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface/75 px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="numeric mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function SubjectFlag({
  src,
  name,
  code,
  accent,
}: {
  src: string | null;
  name: string;
  code: string;
  accent: string;
}) {
  return (
    <div
      className="grid aspect-[3/2] w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/15 shadow-lg sm:w-28"
      style={{ backgroundColor: `${accent}33` }}
    >
      {src ? (
        <img
          src={src}
          alt={`Flag of ${name}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-display text-sm font-bold">{code || "?"}</span>
      )}
    </div>
  );
}

function PointSourceRow({
  item,
  rank,
  maxPoints,
  onOpen,
}: {
  item: CircleItem;
  rank: number;
  maxPoints: number;
  onOpen: () => void;
}) {
  const interactive = item.kind === "jury";
  const width = Math.max(4, Math.min(100, (item.points / maxPoints) * 100));

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onOpen}
      className={cn(
        "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border/60 bg-background/30 p-2.5 text-left",
        interactive && "transition hover:border-primary/35 hover:bg-surface/60 active:scale-[.995]",
        !interactive && "cursor-default",
      )}
      title={interactive ? `Open ${item.name} points` : undefined}
    >
      <span className="numeric w-5 text-center text-[10px] font-semibold text-muted-foreground">
        {rank}
      </span>

      <span className="grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3">
        <span
          className={cn(
            "grid h-11 w-11 place-items-center overflow-hidden border border-white/15 shadow-sm",
            item.kind === "televote" ? "rounded-full bg-fuchsia-500" : "rounded-xl",
          )}
          style={item.kind === "jury" ? { backgroundColor: `${item.accent}33` } : undefined}
        >
          {item.kind === "televote" ? (
            <span className="text-[9px] font-black uppercase tracking-[0.1em] text-white">TELE</span>
          ) : item.flag ? (
            <img src={item.flag} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] font-black">{item.code ?? "J"}</span>
          )}
        </span>

        <span className="min-w-0">
          <span className="flex min-w-0 items-baseline gap-2">
            <strong className="truncate text-sm">{item.name}</strong>
            {item.code ? (
              <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                {item.code}
              </span>
            ) : null}
          </span>
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface">
            <span
              className={cn("block h-full rounded-full", item.kind === "televote" && "bg-fuchsia-500")}
              style={{
                width: `${width}%`,
                backgroundColor: item.kind === "jury" ? item.accent : undefined,
              }}
            />
          </span>
        </span>
      </span>

      <span className="min-w-[4.2rem] text-right">
        <strong className="numeric block text-lg">{item.points}</strong>
        <span className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          pts
        </span>
      </span>
    </button>
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


// Compatibility export for any older internal import while callers migrate.
export const RadialPointsView = PointsExplorerView;

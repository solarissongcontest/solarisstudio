import { FlagChip } from "@/components/FlagChip";

type FlagDisplay = {
  name: string;
  short_code: string;
  flag_image: string | null;
  accent_color: string;
  flag_crop_x?: number | null;
  flag_crop_y?: number | null;
  flag_crop_zoom?: number | null;
};

type Standing = {
  countryId: string;
  jury: number;
  televote: number;
  total: number;
  rank: number;
};

type JuryVote = {
  receiving_country_id: string;
  points: number;
};

type Props = {
  standings: Standing[];
  countries: Map<string, FlagDisplay>;
  jury: JuryVote[];
  topJuryPoints: number;
  showJury: boolean;
  showTelevote: boolean;
};

export function ShowVotingStats({
  standings,
  countries,
  jury,
  topJuryPoints,
  showJury,
  showTelevote,
}: Props) {
  const byOverall = [...standings].sort(
    (a, b) => a.rank - b.rank || b.total - a.total,
  );
  const winner = byOverall[0] ?? null;
  const runnerUp = byOverall[1] ?? null;
  const juryOrder = [...standings].sort(
    (a, b) => b.jury - a.jury || a.rank - b.rank,
  );
  const teleOrder = [...standings].sort(
    (a, b) => b.televote - a.televote || a.rank - b.rank,
  );
  const juryWinner = showJury ? juryOrder[0] ?? null : null;
  const teleWinner = showTelevote ? teleOrder[0] ?? null : null;
  const juryRank = new Map(
    juryOrder.map((row, index) => [row.countryId, index + 1]),
  );
  const teleRank = new Map(
    teleOrder.map((row, index) => [row.countryId, index + 1]),
  );
  const mostPolarizing =
    showJury && showTelevote
      ? [...standings]
          .map((row) => ({
            row,
            juryRank: juryRank.get(row.countryId) ?? 0,
            teleRank: teleRank.get(row.countryId) ?? 0,
            gap: Math.abs(
              (juryRank.get(row.countryId) ?? 0) -
                (teleRank.get(row.countryId) ?? 0),
            ),
          }))
          .sort(
            (a, b) =>
              b.gap - a.gap ||
              b.row.total - a.row.total,
          )[0] ?? null
      : null;

  const topAwards = new Map<string, number>();
  if (showJury) {
    jury.forEach((vote) => {
      if (vote.points !== topJuryPoints) return;
      topAwards.set(
        vote.receiving_country_id,
        (topAwards.get(vote.receiving_country_id) ?? 0) + 1,
      );
    });
  }
  const mostTopAwards =
    [...topAwards.entries()]
      .map(([countryId, count]) => ({
        countryId,
        count,
      }))
      .sort((a, b) => b.count - a.count)[0] ?? null;

  const closestGap =
    byOverall.length > 1
      ? byOverall
          .slice(1)
          .map((row, index) => ({
            a: byOverall[index],
            b: row,
            gap: Math.abs(byOverall[index].total - row.total),
          }))
          .sort((a, b) => a.gap - b.gap)[0]
      : null;

  const totalPoints = standings.reduce((sum, row) => sum + row.total, 0);
  const zeroJury = showJury
    ? standings.filter((row) => row.jury === 0).length
    : null;
  const zeroTele = showTelevote
    ? standings.filter((row) => row.televote === 0).length
    : null;

  return (
    <div className="space-y-4" data-show-voting-stats>
      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-border/70 bg-border/60 sm:grid-cols-4">
        <Metric label="Total points" value={totalPoints} />
        <Metric
          label="Winning margin"
          value={
            winner && runnerUp
              ? `${winner.total - runnerUp.total}`
              : "—"
          }
        />
        <Metric
          label="Zero jury scores"
          value={zeroJury ?? "—"}
        />
        <Metric
          label="Zero televote scores"
          value={zeroTele ?? "—"}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {winner ? (
          <Highlight
            eyebrow="Overall winner"
            country={countries.get(winner.countryId)}
            fallback={winner.countryId}
            value={`${winner.total} pts`}
          />
        ) : null}

        {showJury && juryWinner ? (
          <Highlight
            eyebrow="Jury winner"
            country={countries.get(juryWinner.countryId)}
            fallback={juryWinner.countryId}
            value={`${juryWinner.jury} pts`}
          />
        ) : null}

        {showTelevote && teleWinner ? (
          <Highlight
            eyebrow="Televote winner"
            country={countries.get(teleWinner.countryId)}
            fallback={teleWinner.countryId}
            value={`${teleWinner.televote} pts`}
          />
        ) : null}

        {mostTopAwards ? (
          <Highlight
            eyebrow={`Most ${topJuryPoints}-point awards`}
            country={countries.get(mostTopAwards.countryId)}
            fallback={mostTopAwards.countryId}
            value={`${mostTopAwards.count}×`}
          />
        ) : null}
      </section>

      {(mostPolarizing || closestGap) ? (
        <section className="grid gap-px overflow-hidden rounded-[1.5rem] border border-border/70 bg-border/60 sm:grid-cols-2">
          {mostPolarizing ? (
            <div className="bg-surface/75 p-4 sm:p-5">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Biggest jury / public split
              </p>
              <p className="mt-2 text-sm font-bold">
                {countries.get(mostPolarizing.row.countryId)?.name ??
                  mostPolarizing.row.countryId}
              </p>
              <p className="numeric mt-1 text-xs text-muted-foreground">
                Jury #{mostPolarizing.juryRank} · Televote #{mostPolarizing.teleRank}
                {" · "}
                {mostPolarizing.gap} place{mostPolarizing.gap === 1 ? "" : "s"} apart
              </p>
            </div>
          ) : null}

          {closestGap ? (
            <div className="bg-surface/75 p-4 sm:p-5">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">
                Closest scoreboard gap
              </p>
              <p className="mt-2 text-sm font-bold">
                {countries.get(closestGap.a.countryId)?.name ?? closestGap.a.countryId}
                {" / "}
                {countries.get(closestGap.b.countryId)?.name ?? closestGap.b.countryId}
              </p>
              <p className="numeric mt-1 text-xs text-muted-foreground">
                {closestGap.gap} point{closestGap.gap === 1 ? "" : "s"}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-surface/75 p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="numeric mt-1.5 text-xl font-black">{value}</p>
    </div>
  );
}

function Highlight({
  eyebrow,
  country,
  fallback,
  value,
}: {
  eyebrow: string;
  country?: FlagDisplay;
  fallback: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-[1.35rem] border border-border/70 bg-surface/45 p-4">
      <FlagChip
        code={country?.short_code ?? fallback}
        color={country?.accent_color ?? "#75a9bd"}
        image={country?.flag_image ?? null}
        cropX={country?.flag_crop_x}
        cropY={country?.flag_crop_y}
        cropZoom={country?.flag_crop_zoom}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">
          {eyebrow}
        </p>
        <p className="mt-1 truncate text-sm font-bold">
          {country?.name ?? fallback}
        </p>
      </div>
      <span className="numeric shrink-0 text-sm font-black">{value}</span>
    </div>
  );
}

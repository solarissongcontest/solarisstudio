import type {
  Country,
  JuryVote,
  ResultRow,
  Show,
  Televote,
} from "./data";

import {
  DEFAULT_TOP_SCORE,
  isTopScore,
  makeTopScoreResolver,
  type TopScoreResolver,
  type VotingConfig,
} from "./voting";

/* =========================================================
   SHOW STANDINGS
   ========================================================= */

export type Standing = {
  countryId: string;

  jury: number;
  televote: number;
  total: number;

  rank: number;
  topPoints: number;
};

export function computeStandings(
  countryIds: string[],
  jury: JuryVote[],
  tele: Televote[],
  cfg?: VotingConfig,
  runningOrder?: Map<
    string,
    number
  >,
): Standing[] {
  const juryPoints =
    new Map<
      string,
      number
    >();

  const telePoints =
    new Map<
      string,
      number
    >();

  const topScores =
    new Map<
      string,
      number
    >();

  countryIds.forEach(
    (id) => {
      juryPoints.set(
        id,
        0,
      );

      telePoints.set(
        id,
        0,
      );

      topScores.set(
        id,
        0,
      );
    },
  );

  const top =
    cfg?.juryPoints?.[
      0
    ] ?? 12;

  jury.forEach(
    (vote) => {
      juryPoints.set(
        vote.receiving_country_id,

        (juryPoints.get(
          vote.receiving_country_id,
        ) ?? 0) +
          vote.points,
      );

      if (
        vote.points ===
        top
      ) {
        topScores.set(
          vote.receiving_country_id,

          (topScores.get(
            vote.receiving_country_id,
          ) ?? 0) + 1,
        );
      }
    },
  );

  tele.forEach(
    (vote) => {
      telePoints.set(
        vote.country_id,

        (telePoints.get(
          vote.country_id,
        ) ?? 0) +
          vote.points,
      );
    },
  );

  const juryWeight =
    (cfg?.weighting.jury ??
      50) / 50;

  const teleWeight =
    (cfg?.weighting.televote ??
      50) / 50;

  const applyWeighting =
    cfg?.weightedScoring ===
    true;

  const rows:
    Standing[] =
    countryIds.map(
      (id) => {
        const jury =
          juryPoints.get(
            id,
          ) ?? 0;

        const televote =
          telePoints.get(
            id,
          ) ?? 0;

        return {
          countryId: id,

          jury,
          televote,

          total:
            applyWeighting
              ? Math.round(
                  jury *
                    juryWeight +
                    televote *
                      teleWeight,
                )
              : jury +
                televote,

          rank: 0,

          topPoints:
            topScores.get(
              id,
            ) ?? 0,
        };
      },
    );

  const chain =
    cfg?.tieBreak ?? [
      "televote",
      "twelves",
      "jury",
    ];

  rows.sort(
    (a, b) => {
      if (
        b.total !==
        a.total
      ) {
        return (
          b.total -
          a.total
        );
      }

      for (
        const rule of
        chain
      ) {
        if (
          rule ===
            "televote" &&
          b.televote !==
            a.televote
        ) {
          return (
            b.televote -
            a.televote
          );
        }

        if (
          rule ===
            "jury" &&
          b.jury !==
            a.jury
        ) {
          return (
            b.jury -
            a.jury
          );
        }

        if (
          (rule ===
            "twelves" ||
            rule ===
              "countback") &&
          b.topPoints !==
            a.topPoints
        ) {
          return (
            b.topPoints -
            a.topPoints
          );
        }

        if (
          rule ===
            "runningOrder" &&
          runningOrder
        ) {
          const aOrder =
            runningOrder.get(
              a.countryId,
            ) ?? 999;

          const bOrder =
            runningOrder.get(
              b.countryId,
            ) ?? 999;

          if (
            aOrder !==
            bOrder
          ) {
            return (
              bOrder -
              aOrder
            );
          }
        }
      }

      return 0;
    },
  );

  rows.forEach(
    (
      row,
      index,
    ) => {
      row.rank =
        index + 1;
    },
  );

  return rows;
}

/* =========================================================
   VOTING RELATIONSHIPS
   ========================================================= */

export type Pair = {
  from: string;
  to: string;

  points: number;

  topScoreCount: number;
  count: number;
};

export function pairMatrix(
  votes: JuryVote[],
  resolveTopScore?: TopScoreResolver,
): Map<string, Pair> {
  const resolve =
    resolveTopScore ??
    (() =>
      DEFAULT_TOP_SCORE);

  const map =
    new Map<
      string,
      Pair
    >();

  votes.forEach(
    (vote) => {
      if (
        !vote.voter_country_id
      ) {
        return;
      }

      const key =
        `${vote.voter_country_id}>${vote.receiving_country_id}`;

      const current =
        map.get(key) ?? {
          from:
            vote.voter_country_id,

          to:
            vote.receiving_country_id,

          points: 0,
          topScoreCount: 0,
          count: 0,
        };

      current.points +=
        vote.points;

      current.count +=
        1;

      if (
        isTopScore(
          vote,
          resolve,
        )
      ) {
        current.topScoreCount +=
          1;
      }

      map.set(
        key,
        current,
      );
    },
  );

  return map;
}

export function topSupporters(
  votes: JuryVote[],
  countryId: string,
  limit = 5,
) {
  const map =
    new Map<
      string,
      number
    >();

  votes
    .filter(
      (vote) =>
        vote.receiving_country_id ===
        countryId,
    )
    .forEach(
      (vote) => {
        if (
          !vote.voter_country_id
        ) {
          return;
        }

        map.set(
          vote.voter_country_id,

          (map.get(
            vote.voter_country_id,
          ) ?? 0) +
            vote.points,
        );
      },
    );

  return [
    ...map.entries(),
  ]
    .sort(
      (a, b) =>
        b[1] - a[1],
    )
    .slice(
      0,
      limit,
    );
}

export function topRecipients(
  votes: JuryVote[],
  countryId: string,
  limit = 5,
) {
  const map =
    new Map<
      string,
      number
    >();

  votes
    .filter(
      (vote) =>
        vote.voter_country_id ===
        countryId,
    )
    .forEach(
      (vote) => {
        map.set(
          vote.receiving_country_id,

          (map.get(
            vote.receiving_country_id,
          ) ?? 0) +
            vote.points,
        );
      },
    );

  return [
    ...map.entries(),
  ]
    .sort(
      (a, b) =>
        b[1] - a[1],
    )
    .slice(
      0,
      limit,
    );
}

export function votingSimilarity(
  votes: JuryVote[],
  countries: Country[],
) {
  const vectors =
    new Map<
      string,
      Map<
        string,
        number
      >
    >();

  countries.forEach(
    (country) => {
      vectors.set(
        country.id,
        new Map(),
      );
    },
  );

  votes.forEach(
    (vote) => {
      const vector =
        vectors.get(
          vote.voter_country_id,
        );

      if (
        vector
      ) {
        vector.set(
          vote.receiving_country_id,

          (vector.get(
            vote.receiving_country_id,
          ) ?? 0) +
            vote.points,
        );
      }
    },
  );

  const output:
    Array<{
      a: string;
      b: string;
      score: number;
    }> = [];

  for (
    let i = 0;
    i <
    countries.length;
    i += 1
  ) {
    for (
      let j =
        i + 1;
      j <
      countries.length;
      j += 1
    ) {
      const a =
        vectors.get(
          countries[i].id,
        )!;

      const b =
        vectors.get(
          countries[j].id,
        )!;

      const keys =
        new Set([
          ...a.keys(),
          ...b.keys(),
        ]);

      let dot = 0;
      let normA = 0;
      let normB = 0;

      keys.forEach(
        (key) => {
          const x =
            a.get(key) ??
            0;

          const y =
            b.get(key) ??
            0;

          dot += x * y;

          normA +=
            x * x;

          normB +=
            y * y;
        },
      );

      output.push({
        a:
          countries[i].id,

        b:
          countries[j].id,

        score:
          normA && normB
            ? dot /
              Math.sqrt(
                normA *
                  normB,
              )
            : 0,
      });
    }
  }

  return output.sort(
    (a, b) =>
      b.score -
      a.score,
  );
}

export function relationships(
  votes: JuryVote[],
  resolveTopScore?: TopScoreResolver,
) {
  const matrix =
    pairMatrix(
      votes,
      resolveTopScore,
    );

  const seen =
    new Set<string>();

  const friendships:
    Array<{
      a: string;
      b: string;
      ab: number;
      ba: number;
      total: number;
    }> = [];

  const oneSided:
    Array<{
      a: string;
      b: string;
      ab: number;
      ba: number;
      gap: number;
    }> = [];

  matrix.forEach(
    (pair) => {
      const key =
        [
          pair.from,
          pair.to,
        ]
          .sort()
          .join("|");

      if (
        seen.has(key)
      ) {
        return;
      }

      seen.add(key);

      const ab =
        pair.points;

      const ba =
        matrix.get(
          `${pair.to}>${pair.from}`,
        )?.points ?? 0;

      friendships.push(
        {
          a:
            pair.from,

          b:
            pair.to,

          ab,
          ba,

          total:
            ab + ba,
        },
      );

      const gap =
        ab - ba;

      if (
        Math.abs(gap) >=
        8
      ) {
        oneSided.push(
          gap > 0
            ? {
                a:
                  pair.from,

                b:
                  pair.to,

                ab,
                ba,
                gap,
              }
            : {
                a:
                  pair.to,

                b:
                  pair.from,

                ab: ba,
                ba: ab,

                gap:
                  -gap,
              },
        );
      }
    },
  );

  return {
    friendships:
      friendships
        .filter(
          (friendship) =>
            Math.min(
              friendship.ab,
              friendship.ba,
            ) > 0,
        )
        .sort(
          (a, b) =>
            b.total -
            a.total,
        ),

    oneSided:
      oneSided.sort(
        (a, b) =>
          b.gap -
          a.gap,
      ),
  };
}

export function votingClusters(
  votes: JuryVote[],
  countries: Country[],
  threshold = 0.6,
) {
  const similarities =
    votingSimilarity(
      votes,
      countries,
    );

  const parent =
    new Map(
      countries.map(
        (country) => [
          country.id,
          country.id,
        ],
      ),
    );

  const find = (
    id: string,
  ): string =>
    parent.get(id) ===
    id
      ? id
      : find(
          parent.get(
            id,
          )!,
        );

  similarities
    .filter(
      (row) =>
        row.score >=
        threshold,
    )
    .forEach(
      (row) => {
        const aRoot =
          find(row.a);

        const bRoot =
          find(row.b);

        if (
          aRoot !==
          bRoot
        ) {
          parent.set(
            aRoot,
            bRoot,
          );
        }
      },
    );

  const groups =
    new Map<
      string,
      string[]
    >();

  countries.forEach(
    (country) => {
      const root =
        find(
          country.id,
        );

      groups.set(
        root,

        [
          ...(groups.get(
            root,
          ) ?? []),

          country.id,
        ],
      );
    },
  );

  return [
    ...groups.values(),
  ]
    .filter(
      (group) =>
        group.length > 1,
    )
    .sort(
      (a, b) =>
        b.length -
        a.length,
    );
}

export function regionalBias(
  votes: JuryVote[],
  countries: Country[],
) {
  const region =
    new Map(
      countries.map(
        (country) => [
          country.id,
          country.region,
        ],
      ),
    );

  const given =
    new Map<
      string,
      {
        inRegion: number;
        total: number;
      }
    >();

  votes.forEach(
    (vote) => {
      if (
        !vote.voter_country_id
      ) {
        return;
      }

      const current =
        given.get(
          vote.voter_country_id,
        ) ?? {
          inRegion: 0,
          total: 0,
        };

      current.total +=
        vote.points;

      if (
        region.get(
          vote.voter_country_id,
        ) ===
        region.get(
          vote.receiving_country_id,
        )
      ) {
        current.inRegion +=
          vote.points;
      }

      given.set(
        vote.voter_country_id,
        current,
      );
    },
  );

  return [
    ...given.entries(),
  ]
    .map(
      ([
        id,
        values,
      ]) => ({
        id,

        share:
          values.total
            ? values.inRegion /
              values.total
            : 0,

        ...values,
      }),
    )
    .sort(
      (a, b) =>
        b.share -
        a.share,
    );
}

/* =========================================================
   COUNTRY PROFILE
   ========================================================= */

export type CountryProfile = {
  participations: number;
  showAppearances: number;

  semiFinalAppearances: number;
  finalAppearances: number;

  qualifications: number;
  nonQualifications: number;

  wins: number;

  best:
    | number
    | null;

  worst:
    | number
    | null;

  average:
    | number
    | null;

  pointsReceived: number;
  pointsGiven: number;

  topScoresReceived: number;
  topScoresGiven: number;

  history: Array<{
    editionNumber: number;

    rank:
      | number
      | null;

    total: number;
  }>;
};

export function countryProfile(
  countryId: string,
  results: ResultRow[],
  jury: JuryVote[],

  editionNumber:
    Map<
      string,
      number | null
    >,

  opts?: {
    shows?: Show[];

    resolveTopScore?: TopScoreResolver;
  },
): CountryProfile {
  const resolve =
    opts?.resolveTopScore ??
    makeTopScoreResolver(
      opts?.shows,
    );

  const kindOf =
    new Map(
      (
        opts?.shows ??
        []
      ).map(
        (show) => [
          show.id,
          show.kind,
        ],
      ),
    );

  const kind = (
    result: ResultRow,
  ) =>
    result.show_id
      ? kindOf.get(
          result.show_id,
        )
      : undefined;

  const mine =
    results.filter(
      (result) =>
        result.country_id ===
        countryId,
    );

  const editionIds =
    [
      ...new Set(
        mine.map(
          (result) =>
            result.edition_id,
        ),
      ),
    ];

  const finals =
    mine.filter(
      (result) =>
        kind(result) ===
        "grand-final",
    );

  const semis =
    mine.filter(
      (result) =>
        kind(result) ===
        "semi-final",
    );

  const finalEditionIds =
    new Set(
      finals.map(
        (result) =>
          result.edition_id,
      ),
    );

  const qualifications =
    semis.filter(
      (result) =>
        finalEditionIds.has(
          result.edition_id,
        ),
    ).length;

  const placementRows =
    opts?.shows?.length
      ? finals.length
        ? finals
        : mine
      : mine;

  const ranks =
    placementRows
      .map(
        (result) =>
          result.final_rank,
      )
      .filter(
        (
          rank,
        ): rank is number =>
          rank != null,
      );

  const historyRows =
    editionIds.map(
      (editionId) => {
        const rows =
          mine.filter(
            (result) =>
              result.edition_id ===
              editionId,
          );

        const finalRow =
          rows.find(
            (result) =>
              kind(result) ===
              "grand-final",
          );

        const best =
          finalRow ??
          [...rows].sort(
            (a, b) =>
              (a.final_rank ??
                999) -
              (b.final_rank ??
                999),
          )[0];

        return {
          editionNumber:
            editionNumber.get(
              editionId,
            ) ?? 0,

          rank:
            best?.final_rank ??
            null,

          total:
            best?.total_points ??
            0,
        };
      },
    );

  return {
    participations:
      editionIds.length,

    showAppearances:
      mine.length,

    semiFinalAppearances:
      semis.length,

    finalAppearances:
      finals.length,

    qualifications,

    nonQualifications:
      semis.length -
      qualifications,

    wins:
      finals.length
        ? finals.filter(
            (result) =>
              result.final_rank ===
              1,
          ).length
        : ranks.filter(
            (rank) =>
              rank === 1,
          ).length,

    best:
      ranks.length
        ? Math.min(
            ...ranks,
          )
        : null,

    worst:
      ranks.length
        ? Math.max(
            ...ranks,
          )
        : null,

    average:
      ranks.length
        ? ranks.reduce(
            (
              total,
              rank,
            ) =>
              total +
              rank,
            0,
          ) /
          ranks.length
        : null,

    pointsReceived:
      mine.reduce(
        (
          total,
          result,
        ) =>
          total +
          result.total_points,
        0,
      ),

    pointsGiven:
      jury
        .filter(
          (vote) =>
            vote.voter_country_id ===
            countryId,
        )
        .reduce(
          (
            total,
            vote,
          ) =>
            total +
            vote.points,
          0,
        ),

    topScoresReceived:
      jury.filter(
        (vote) =>
          vote.receiving_country_id ===
            countryId &&
          isTopScore(
            vote,
            resolve,
          ),
      ).length,

    topScoresGiven:
      jury.filter(
        (vote) =>
          vote.voter_country_id ===
            countryId &&
          isTopScore(
            vote,
            resolve,
          ),
      ).length,

    history:
      historyRows.sort(
        (a, b) =>
          a.editionNumber -
          b.editionNumber,
      ),
  };
}

/* =========================================================
   RECORDS
   ========================================================= */

export type RecordEntry = {
  label: string;
  value: string;
  detail: string;
};

function rankBy(
  rows: ResultRow[],

  value: (
    result: ResultRow,
  ) => number,
): Map<string, number> {
  const sorted =
    [...rows].sort(
      (a, b) =>
        value(b) -
        value(a),
    );

  const ranks =
    new Map<
      string,
      number
    >();

  sorted.forEach(
    (
      result,
      index,
    ) => {
      const previous =
        sorted[index - 1];

      ranks.set(
        result.country_id,

        previous &&
          value(previous) ===
            value(result)
          ? ranks.get(
              previous.country_id,
            )!
          : index + 1,
      );
    },
  );

  return ranks;
}

export function computeRecords(
  results: ResultRow[],
  jury: JuryVote[],
  countries: Country[],

  editionNumber:
    Map<
      string,
      number | null
    >,

  opts?: {
    shows?: Show[];

    resolveTopScore?: TopScoreResolver;
  },
): RecordEntry[] {
  const resolve =
    opts?.resolveTopScore ??
    makeTopScoreResolver(
      opts?.shows,
    );

  const showName =
    new Map(
      (
        opts?.shows ??
        []
      ).map(
        (show) => [
          show.id,
          show.name,
        ],
      ),
    );

  const countryName =
    new Map(
      countries.map(
        (country) => [
          country.id,
          country.name,
        ],
      ),
    );

  const editionLabel = (
    id: string,
  ) => {
    const number =
      editionNumber.get(
        id,
      );

    return number != null
      ? `SSC ${number}`
      : "Edition";
  };

  const context = (
    result: ResultRow,
  ) =>
    [
      editionLabel(
        result.edition_id,
      ),

      result.show_id
        ? showName.get(
            result.show_id,
          )
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const rowLabel = (
    result: ResultRow,
  ) =>
    `${countryName.get(
      result.country_id,
    ) ?? "?"} · ${context(
      result,
    )}`;

  if (
    !results.length
  ) {
    return [];
  }

  const sorted =
    [...results].sort(
      (a, b) =>
        b.total_points -
        a.total_points,
    );

  const highest =
    sorted[0];

  const lowest =
    sorted[
      sorted.length - 1
    ];

  const winners =
    results.filter(
      (result) =>
        result.final_rank ===
        1,
    );

  const lowestWin =
    [...winners].sort(
      (a, b) =>
        a.total_points -
        b.total_points,
    )[0];

  const byShow =
    new Map<
      string,
      ResultRow[]
    >();

  results.forEach(
    (result) => {
      const key =
        result.show_id ??
        `edition:${result.edition_id}`;

      byShow.set(
        key,

        [
          ...(byShow.get(
            key,
          ) ?? []),

          result,
        ],
      );
    },
  );

  let biggestMargin = {
    margin: -1,
    text: "—",
  };

  let closest = {
    margin:
      Number.MAX_SAFE_INTEGER,

    text: "—",
  };

  byShow.forEach(
    (rows) => {
      const ranked =
        [...rows].sort(
          (a, b) =>
            b.total_points -
            a.total_points,
        );

      if (
        ranked.length < 2
      ) {
        return;
      }

      const margin =
        ranked[0]
          .total_points -
        ranked[1]
          .total_points;

      const text =
        `${countryName.get(
          ranked[0]
            .country_id,
        ) ?? "?"} over ${
          countryName.get(
            ranked[1]
              .country_id,
          ) ?? "?"
        } · ${context(
          ranked[0],
        )}`;

      if (
        margin >
        biggestMargin.margin
      ) {
        biggestMargin = {
          margin,
          text,
        };
      }

      if (
        margin <
        closest.margin
      ) {
        closest = {
          margin,
          text,
        };
      }
    },
  );

  const topIn =
    new Map<
      string,
      number
    >();

  const topOut =
    new Map<
      string,
      number
    >();

  jury
    .filter(
      (vote) =>
        isTopScore(
          vote,
          resolve,
        ),
    )
    .forEach(
      (vote) => {
        topIn.set(
          vote.receiving_country_id,

          (topIn.get(
            vote.receiving_country_id,
          ) ?? 0) + 1,
        );

        if (
          vote.voter_country_id
        ) {
          topOut.set(
            vote.voter_country_id,

            (topOut.get(
              vote.voter_country_id,
            ) ?? 0) + 1,
          );
        }
      },
    );

  const top = (
    map:
      Map<
        string,
        number
      >,
  ) => {
    const entry =
      [
        ...map.entries(),
      ].sort(
        (a, b) =>
          b[1] - a[1],
      )[0];

    return entry
      ? {
          name:
            countryName.get(
              entry[0],
            ) ?? "?",

          n:
            entry[1],
        }
      : {
          name: "—",
          n: 0,
        };
  };

  let comeback:
    | {
        places: number;
        row: ResultRow;
      }
    | null = null;

  let collapse:
    | {
        places: number;
        row: ResultRow;
      }
    | null = null;

  byShow.forEach(
    (rows) => {
      if (
        rows.length < 2
      ) {
        return;
      }

      const juryRank =
        rankBy(
          rows,
          (result) =>
            result.jury_points,
        );

      const finalRank =
        rankBy(
          rows,
          (result) =>
            result.total_points,
        );

      rows.forEach(
        (result) => {
          const moved =
            (juryRank.get(
              result.country_id,
            ) ?? 0) -
            (finalRank.get(
              result.country_id,
            ) ?? 0);

          if (
            moved > 0 &&
            (!comeback ||
              moved >
                comeback.places)
          ) {
            comeback = {
              places:
                moved,

              row:
                result,
            };
          }

          if (
            moved < 0 &&
            (!collapse ||
              -moved >
                collapse.places)
          ) {
            collapse = {
              places:
                -moved,

              row:
                result,
            };
          }
        },
      );
    },
  );

  const winsBy =
    new Map<
      string,
      number
    >();

  winners.forEach(
    (winner) => {
      winsBy.set(
        winner.country_id,

        (winsBy.get(
          winner.country_id,
        ) ?? 0) + 1,
      );
    },
  );

  const mostSuccessful =
    top(
      winsBy,
    );

  const rankSpread =
    new Map<
      string,
      number[]
    >();

  results.forEach(
    (result) => {
      if (
        result.final_rank !=
        null
      ) {
        rankSpread.set(
          result.country_id,

          [
            ...(rankSpread.get(
              result.country_id,
            ) ?? []),

            result.final_rank,
          ],
        );
      }
    },
  );

  let consistent = {
    name: "—",

    spread:
      Number.MAX_SAFE_INTEGER,
  };

  rankSpread.forEach(
    (
      ranks,
      id,
    ) => {
      if (
        ranks.length < 2
      ) {
        return;
      }

      const spread =
        Math.max(
          ...ranks,
        ) -
        Math.min(
          ...ranks,
        );

      if (
        spread <
        consistent.spread
      ) {
        consistent = {
          name:
            countryName.get(
              id,
            ) ?? "?",

          spread,
        };
      }
    },
  );

  return [
    {
      label:
        "Highest score ever",

      value:
        String(
          highest.total_points,
        ),

      detail:
        rowLabel(
          highest,
        ),
    },

    {
      label:
        "Lowest score ever",

      value:
        String(
          lowest.total_points,
        ),

      detail:
        rowLabel(
          lowest,
        ),
    },

    {
      label:
        "Lowest winning score",

      value:
        lowestWin
          ? String(
              lowestWin.total_points,
            )
          : "—",

      detail:
        lowestWin
          ? rowLabel(
              lowestWin,
            )
          : "No completed edition yet",
    },

    {
      label:
        "Largest winning margin (per show)",

      value:
        String(
          Math.max(
            biggestMargin.margin,
            0,
          ),
        ),

      detail:
        biggestMargin.text,
    },

    {
      label:
        "Closest finish (per show)",

      value:
        closest.margin ===
        Number.MAX_SAFE_INTEGER
          ? "—"
          : String(
              closest.margin,
            ),

      detail:
        closest.text,
    },

    {
      label:
        "Most top scores received",

      value:
        String(
          top(topIn).n,
        ),

      detail:
        top(topIn).name,
    },

    {
      label:
        "Most top scores given",

      value:
        String(
          top(topOut).n,
        ),

      detail:
        top(topOut).name,
    },

    {
      label:
        "Biggest comeback (places gained after the jury vote)",

      value:
        comeback
          ? `+${comeback.places}`
          : "—",

      detail:
        comeback
          ? rowLabel(
              comeback.row,
            )
          : "—",
    },

    {
      label:
        "Biggest collapse (places lost after the jury vote)",

      value:
        collapse
          ? `-${collapse.places}`
          : "—",

      detail:
        collapse
          ? rowLabel(
              collapse.row,
            )
          : "—",
    },

    {
      label:
        "Most successful country",

      value:
        `${mostSuccessful.n} win(s)`,

      detail:
        mostSuccessful.name,
    },

    {
      label:
        "Most consistent country",

      value:
        consistent.spread ===
        Number.MAX_SAFE_INTEGER
          ? "—"
          : `±${consistent.spread}`,

      detail:
        consistent.name,
    },
  ];
}

export const DEFAULT_TOP_SCORE_FALLBACK =
  DEFAULT_TOP_SCORE;
3. src/routes/countries/$code.tsx

Replace the whole file:

import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";

import {
  useMemo,
  useState,
} from "react";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AppShell,
  Panel,
  StatTile,
} from "@/components/AppShell";

import {
  FlagChip,
} from "@/components/FlagChip";

import {
  ResponsiveTabs,
} from "@/components/ResponsiveTabs";

import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";

import {
  computeCountryStats,
  computeHeadToHead,
  computeRelationship,
} from "@/lib/stats";

export const Route =
  createFileRoute(
    "/countries/$code",
  )({
    head: ({ params }) => ({
      meta: [
        {
          title:
            `${params.code} — Country profile — Solaris Studio`,
        },
      ],
    }),

    component:
      CountryProfilePage,
  });

const TABS = [
  {
    value:
      "overview",
    label:
      "Overview",
  },

  {
    value:
      "results",
    label:
      "Results",
  },

  {
    value:
      "voting",
    label:
      "Voting",
  },

  {
    value:
      "relationships",
    label:
      "Relationships",
  },
] as const;

type Tab =
  (typeof TABS)[number]["value"];

function CountryProfilePage() {
  const {
    code,
  } =
    Route.useParams();

  const {
    data: countries,
  } =
    useCountries();

  const {
    data: editions,
  } =
    useEditions();

  const {
    data: shows,
  } =
    useAllShows();

  const {
    data: participants,
  } =
    useAllParticipants();

  const {
    data: results,
  } =
    useAllResults();

  const {
    data: jury,
  } =
    useAllJuryVotes();

  const {
    data: televote,
  } =
    useAllTelevotes();

  const [
    tab,
    setTab,
  ] =
    useState<Tab>(
      "overview",
    );

  const country =
    (
      countries ??
      []
    ).find(
      (item) =>
        item.short_code.toUpperCase() ===
        code.toUpperCase(),
    );

  const opts =
    useMemo(
      () => ({
        editions:
          editions ??
          [],

        shows:
          shows ??
          [],

        participants:
          participants ??
          [],

        results:
          results ??
          [],

        jury:
          jury ??
          [],

        televote:
          televote ??
          [],
      }),
      [
        editions,
        shows,
        participants,
        results,
        jury,
        televote,
      ],
    );

  const stats =
    useMemo(
      () =>
        country
          ? computeCountryStats(
              country.id,
              opts,
            )
          : null,
      [
        country,
        opts,
      ],
    );

  if (
    !country
  ) {
    return (
      <AppShell>
        <div className="glass p-6">
          <h1 className="font-display text-2xl font-bold">
            Country not found
          </h1>

          <Link
            to="/countries"
            className="mt-4 inline-block text-sm text-primary"
          >
            ← Countries
          </Link>
        </div>
      </AppShell>
    );
  }

  const countryMap =
    new Map(
      (
        countries ??
        []
      ).map(
        (item) => [
          item.id,
          item,
        ],
      ),
    );

  const editionMap =
    new Map(
      (
        editions ??
        []
      ).map(
        (edition) => [
          edition.id,
          edition,
        ],
      ),
    );

  const showMap =
    new Map(
      (
        shows ??
        []
      ).map(
        (show) => [
          show.id,
          show,
        ],
      ),
    );

  /* =========================================================
     RESULTS
     ========================================================= */

  const myResults =
    (
      results ??
      []
    )
      .filter(
        (result) =>
          result.country_id ===
          country.id,
      )
      .sort(
        (a, b) =>
          (editionMap.get(
            b.edition_id,
          )?.edition_number ??
            -1) -
          (editionMap.get(
            a.edition_id,
          )?.edition_number ??
            -1),
      );

  const finalResults =
    myResults.filter(
      (result) =>
        showMap.get(
          result.show_id ??
            "",
        )?.kind ===
        "grand-final",
    );

  const semiRows =
    (
      participants ??
      []
    )
      .filter(
        (participant) =>
          participant.country_id ===
            country.id &&
          showMap.get(
            participant.show_id ??
              "",
          )?.kind ===
            "semi-final",
      )
      .map(
        (participant) => ({
          participant,

          edition:
            editionMap.get(
              participant.edition_id,
            ),

          result:
            myResults.find(
              (result) =>
                result.show_id ===
                participant.show_id,
            ),
        }),
      )
      .sort(
        (a, b) =>
          (b.edition
            ?.edition_number ??
            -1) -
          (a.edition
            ?.edition_number ??
            -1),
      );

  /* =========================================================
     VOTING
     ========================================================= */

  const given =
    (
      jury ??
      []
    ).filter(
      (vote) =>
        vote.voter_country_id ===
        country.id,
    );

  const received =
    (
      jury ??
      []
    ).filter(
      (vote) =>
        vote.receiving_country_id ===
        country.id,
    );

  const aggregate = (
    rows:
      typeof given,

    key:
      | "receiving_country_id"
      | "voter_country_id",
  ) => {
    const totals =
      new Map<
        string,
        number
      >();

    rows.forEach(
      (vote) => {
        const id =
          vote[key];

        if (
          !id
        ) {
          return;
        }

        totals.set(
          id,

          (totals.get(
            id,
          ) ?? 0) +
            vote.points,
        );
      },
    );

    return [
      ...totals.entries(),
    ]
      .map(
        ([
          id,
          points,
        ]) => ({
          country:
            countryMap.get(
              id,
            ),

          points,
        }),
      )
      .filter(
        (
          item,
        ): item is {
          country: NonNullable<
            typeof item.country
          >;
          points: number;
        } =>
          !!item.country,
      )
      .sort(
        (a, b) =>
          b.points -
          a.points,
      )
      .slice(
        0,
        8,
      );
  };

  const topGiven =
    aggregate(
      given,
      "receiving_country_id",
    );

  const topReceived =
    aggregate(
      received,
      "voter_country_id",
    );

  /* =========================================================
     RELATIONSHIPS
     ========================================================= */

  const myEditionIds =
    new Set(
      myResults.map(
        (result) =>
          result.edition_id,
      ),
    );

  const sharedIds =
    new Set<string>();

  (
    results ??
    []
  ).forEach(
    (result) => {
      if (
        result.country_id !==
          country.id &&
        myEditionIds.has(
          result.edition_id,
        )
      ) {
        sharedIds.add(
          result.country_id,
        );
      }
    },
  );

  const relationshipRows =
    [
      ...sharedIds,
    ]
      .map(
        (id) => {
          const other =
            countryMap.get(
              id,
            );

          if (
            !other
          ) {
            return null;
          }

          return {
            other,

            relationship:
              computeRelationship(
                country.id,
                id,
                {
                  editions:
                    editions ??
                    [],

                  jury:
                    jury ??
                    [],

                  results:
                    results ??
                    [],

                  shows:
                    shows ??
                    [],
                },
              ),

            headToHead:
              computeHeadToHead(
                country.id,
                id,
                {
                  editions:
                    editions ??
                    [],

                  results:
                    results ??
                    [],
                },
              ),
          };
        },
      )
      .filter(
        (
          row,
        ): row is NonNullable<
          typeof row
        > =>
          !!row,
      )
      .sort(
        (a, b) =>
          b.relationship
            .friendshipScore -
          a.relationship
            .friendshipScore,
      );

  /* =========================================================
     CHART
     ========================================================= */

  const chartData =
    stats?.timeline
      .filter(
        (point) =>
          point.rank !=
          null,
      )
      .map(
        (point) => ({
          edition:
            point.label,

          editionNumber:
            point.editionNumber,

          rank:
            point.rank,
        }),
      ) ?? [];

  return (
    <AppShell>
      {/* =====================================================
          COUNTRY HERO
         ===================================================== */}

      <section
        className="
          glass
          relative
          mb-6
          overflow-hidden
          p-5
          sm:p-6
        "
      >
        {country.flag_image && (
          <div
            className="
              absolute
              -right-20
              -top-20
              h-72
              w-72
              overflow-hidden
              rounded-full
              opacity-[0.08]
            "
          >
            <img
              src={
                country.flag_image
              }
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="relative z-10">
          <div
            className="
              flex
              items-center
              gap-4
            "
          >
            <FlagChip
              code={
                country.short_code
              }
              color={
                country.accent_color
              }
              image={
                country.flag_image
              }
              size="xl"
            />

            <div className="min-w-0">
              <p
                className="
                  text-[10px]
                  font-semibold
                  uppercase
                  tracking-[0.18em]
                  text-primary
                "
              >
                {country.region}
              </p>

              <h1
                className="
                  mt-1
                  truncate
                  font-display
                  text-3xl
                  font-bold
                  sm:text-4xl
                "
              >
                {country.name}
              </h1>

              {country.native_name &&
                country.native_name !==
                  country.name && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {
                      country.native_name
                    }
                  </p>
                )}
            </div>
          </div>

          {country.description && (
            <p
              className="
                mt-4
                max-w-2xl
                text-sm
                leading-relaxed
                text-muted-foreground
              "
            >
              {
                country.description
              }
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/countries"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            >
              ← Countries
            </Link>

            <Link
              to="/compare"
              search={{
                a:
                  country.short_code,
              }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            >
              Compare
            </Link>
          </div>
        </div>
      </section>

      <ResponsiveTabs
        value={tab}
        options={TABS}
        onChange={
          setTab
        }
        label="Country section"
        className="mb-5"
      />

      {!stats ||
      stats.participations ===
        0 ? (
        <Panel>
          <p className="text-sm text-muted-foreground">
            No contest data is available for this country yet.
          </p>
        </Panel>
      ) : (
        <>
          {/* =================================================
              OVERVIEW
             ================================================= */}

          {tab ===
            "overview" && (
            <div className="space-y-5">
              <Panel>
                <div
                  className="
                    grid
                    grid-cols-2
                    gap-x-5
                    gap-y-5
                    sm:grid-cols-4
                  "
                >
                  <StatTile
                    label="Participations"
                    value={
                      stats.participations
                    }
                  />

                  <StatTile
                    label="Wins"
                    value={
                      stats.wins
                    }
                  />

                  <StatTile
                    label="Avg. placement"
                    value={
                      stats.avgCombinedPlacement?.toFixed(
                        1,
                      ) ??
                      "—"
                    }
                  />

                  <StatTile
                    label="Qualification"
                    value={
                      stats.qualificationPct !=
                      null
                        ? `${stats.qualificationPct.toFixed(
                            0,
                          )}%`
                        : "—"
                    }
                  />
                </div>
              </Panel>

              <div
                className="
                  grid
                  gap-5
                  lg:grid-cols-[1.2fr_.8fr]
                "
              >
                <Panel title="Recent editions">
                  <div className="divide-y divide-border/60">
                    {myResults
                      .slice(
                        0,
                        6,
                      )
                      .map(
                        (
                          result,
                        ) => {
                          const edition =
                            editionMap.get(
                              result.edition_id,
                            );

                          const show =
                            showMap.get(
                              result.show_id ??
                                "",
                            );

                          return (
                            <div
                              key={`${result.edition_id}-${result.show_id}`}
                              className="
                                grid
                                grid-cols-[1fr_auto]
                                gap-3
                                py-3
                                first:pt-0
                                last:pb-0
                              "
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {edition
                                    ? editionLabel(
                                        edition,
                                      )
                                    : "Edition"}
                                </p>

                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {show?.name ??
                                    "Show"}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="numeric text-sm font-semibold">
                                  {result.final_rank
                                    ? `#${result.final_rank}`
                                    : "—"}
                                </p>

                                <p className="numeric mt-0.5 text-[11px] text-muted-foreground">
                                  {
                                    result.total_points
                                  }{" "}
                                  pts
                                </p>
                              </div>
                            </div>
                          );
                        },
                      )}
                  </div>
                </Panel>

                <Panel title="Career">
                  <div className="divide-y divide-border/60">
                    <Row
                      label="Finals reached"
                      value={
                        stats.finals
                      }
                    />

                    <Row
                      label="Podiums"
                      value={
                        stats.podiums
                      }
                    />

                    <Row
                      label="Top 10 finishes"
                      value={
                        stats.top10
                      }
                    />

                    <Row
                      label="Highest score"
                      value={
                        stats.highestScore ??
                        "—"
                      }
                    />

                    <Row
                      label="Current qualification streak"
                      value={
                        stats.consecutiveQualifications
                      }
                    />
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {/* =================================================
              RESULTS
             ================================================= */}

          {tab ===
            "results" && (
            <div className="space-y-5">
              <Panel
                title="Placement timeline"
                description="Edition numbers are used as the historical timeline. Lower placement is better."
              >
                {chartData.length ? (
                  <div className="h-[270px]">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <LineChart
                        data={
                          chartData
                        }
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                        />

                        <XAxis
                          dataKey="edition"
                          stroke="var(--muted-foreground)"
                          fontSize={
                            11
                          }
                        />

                        <YAxis
                          reversed
                          allowDecimals={
                            false
                          }
                          stroke="var(--muted-foreground)"
                          fontSize={
                            11
                          }
                        />

                        <Tooltip
                          contentStyle={{
                            background:
                              "var(--popover)",

                            border:
                              "1px solid var(--border)",

                            borderRadius:
                              14,
                          }}
                        />

                        <Line
                          type="monotone"
                          dataKey="rank"
                          name="Placement"
                          stroke="var(--primary)"
                          strokeWidth={
                            3
                          }
                          dot
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No ranked results recorded yet.
                  </p>
                )}
              </Panel>

              <div className="grid gap-5 lg:grid-cols-2">
                <Panel title="Grand finals">
                  <ResultList
                    rows={
                      finalResults
                    }
                    editionMap={
                      editionMap
                    }
                    showMap={
                      showMap
                    }
                  />
                </Panel>

                <Panel title="Qualification history">
                  {semiRows.length ? (
                    <div className="divide-y divide-border/60">
                      {semiRows.map(
                        ({
                          participant,
                          edition,
                          result,
                        }) => (
                          <div
                            key={
                              participant.id
                            }
                            className="
                              flex
                              items-center
                              justify-between
                              gap-3
                              py-3
                              first:pt-0
                              last:pb-0
                            "
                          >
                            <div>
                              <p className="text-sm font-medium">
                                {edition
                                  ? editionLabel(
                                      edition,
                                    )
                                  : "Edition"}
                              </p>

                              <p className="numeric mt-0.5 text-[11px] text-muted-foreground">
                                {result?.total_points ??
                                  "—"}{" "}
                                pts
                              </p>
                            </div>

                            <span
                              className={
                                participant.qualified
                                  ? "rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary"
                                  : "rounded-full bg-surface px-2 py-1 text-[10px] text-muted-foreground"
                              }
                            >
                              {participant.qualified
                                ? "Qualified"
                                : "Eliminated"}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No semi-final history recorded.
                    </p>
                  )}
                </Panel>
              </div>
            </div>
          )}

          {/* =================================================
              VOTING
             ================================================= */}

          {tab ===
            "voting" && (
            <div className="space-y-5">
              <Panel>
                <div
                  className="
                    grid
                    grid-cols-2
                    gap-x-5
                    gap-y-5
                    sm:grid-cols-4
                  "
                >
                  <StatTile
                    label="Avg. received"
                    value={
                      stats.avgReceivedPerContest?.toFixed(
                        0,
                      ) ??
                      "—"
                    }
                  />

                  <StatTile
                    label="Avg. given"
                    value={
                      stats.avgGivenPerContest?.toFixed(
                        0,
                      ) ??
                      "—"
                    }
                  />

                  <StatTile
                    label="Top scores received"
                    value={
                      stats.topScoresReceived
                    }
                  />

                  <StatTile
                    label="Top scores given"
                    value={
                      stats.topScoresGiven
                    }
                  />
                </div>
              </Panel>

              <div className="grid gap-5 lg:grid-cols-2">
                <CountryPointList
                  title="Most support received"
                  rows={
                    topReceived
                  }
                />

                <CountryPointList
                  title="Most points given"
                  rows={
                    topGiven
                  }
                />
              </div>
            </div>
          )}

          {/* =================================================
              RELATIONSHIPS
             ================================================= */}

          {tab ===
            "relationships" && (
            <Panel
              title="Closest relationships"
              description="Ranked by historical friendship score across SSC editions."
            >
              {relationshipRows.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {relationshipRows
                    .slice(
                      0,
                      10,
                    )
                    .map(
                      ({
                        other,
                        relationship,
                        headToHead,
                      }) => (
                        <Link
                          key={
                            other.id
                          }
                          to="/relationships/$pair"
                          params={{
                            pair:
                              `${country.short_code}-vs-${other.short_code}`.toUpperCase(),
                          }}
                          className="
                            rounded-xl
                            bg-surface
                            px-3
                            py-3
                            hover:bg-surface-strong
                          "
                        >
                          <div className="flex items-center gap-3">
                            <FlagChip
                              code={
                                other.short_code
                              }
                              color={
                                other.accent_color
                              }
                              image={
                                other.flag_image
                              }
                              size="sm"
                            />

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {
                                  other.name
                                }
                              </p>

                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {
                                  relationship.friendshipScore.toFixed(
                                    0,
                                  )
                                }{" "}
                                friendship ·{" "}
                                {
                                  headToHead.sharedEditions
                                }{" "}
                                shared editions
                              </p>
                            </div>
                          </div>
                        </Link>
                      ),
                    )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No relationships recorded yet.
                </p>
              )}
            </Panel>
          )}
        </>
      )}
    </AppShell>
  );
}

/* =========================================================
   RESULT LIST
   ========================================================= */

function ResultList({
  rows,
  editionMap,
  showMap,
}: {
  rows: Array<{
    id: string;
    edition_id: string;
    show_id: string | null;
    final_rank: number | null;
    total_points: number;
  }>;

  editionMap:
    Map<
      string,
      any
    >;

  showMap:
    Map<
      string,
      any
    >;
}) {
  if (
    !rows.length
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        No Grand Final results recorded.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {rows.map(
        (row) => {
          const edition =
            editionMap.get(
              row.edition_id,
            );

          const show =
            showMap.get(
              row.show_id ??
                "",
            );

          return (
            <div
              key={
                row.id
              }
              className="
                flex
                items-center
                justify-between
                gap-3
                py-3
                first:pt-0
                last:pb-0
              "
            >
              <div>
                <p className="text-sm font-medium">
                  {edition
                    ? editionLabel(
                        edition,
                      )
                    : "Edition"}
                </p>

                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {show?.name ??
                    "Grand Final"}
                </p>
              </div>

              <div className="text-right">
                <p className="numeric text-sm font-semibold">
                  {row.final_rank
                    ? `#${row.final_rank}`
                    : "—"}
                </p>

                <p className="numeric mt-0.5 text-[11px] text-muted-foreground">
                  {
                    row.total_points
                  }{" "}
                  pts
                </p>
              </div>
            </div>
          );
        },
      )}
    </div>
  );
}

/* =========================================================
   COUNTRY POINT LIST
   ========================================================= */

function CountryPointList({
  title,
  rows,
}: {
  title: string;

  rows: Array<{
    country: any;
    points: number;
  }>;
}) {
  return (
    <Panel
      title={title}
    >
      {rows.length ? (
        <div className="divide-y divide-border/60">
          {rows.map(
            ({
              country,
              points,
            }) => (
              <Link
                key={
                  country.id
                }
                to="/countries/$code"
                params={{
                  code:
                    country.short_code,
                }}
                className="
                  flex
                  items-center
                  gap-3
                  py-3
                  first:pt-0
                  last:pb-0
                "
              >
                <FlagChip
                  code={
                    country.short_code
                  }
                  color={
                    country.accent_color
                  }
                  image={
                    country.flag_image
                  }
                  size="sm"
                />

                <span className="min-w-0 flex-1 truncate text-sm">
                  {
                    country.name
                  }
                </span>

                <span className="numeric text-sm font-semibold">
                  {
                    points
                  }
                </span>
              </Link>
            ),
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No voting data.
        </p>
      )}
    </Panel>
  );
}

function Row({
  label,
  value,
}: {
  label: string;

  value:
    | string
    | number;
}) {
  return (
    <div
      className="
        flex
        items-center
        justify-between
        gap-4
        py-3
        first:pt-0
        last:pb-0
      "
    >
      <span className="text-sm text-muted-foreground">
        {label}
      </span>

      <span className="numeric text-sm font-semibold">
        {value}
      </span>
    </div>
  );
}

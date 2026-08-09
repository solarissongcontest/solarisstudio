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

/* ============================================================
   STANDINGS
   ============================================================ */

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
  runningOrder?: Map<string, number>,
): Standing[] {
  const juryPoints = new Map<string, number>();
  const telePoints = new Map<string, number>();
  const topScores = new Map<string, number>();

  countryIds.forEach((id) => {
    juryPoints.set(id, 0);
    telePoints.set(id, 0);
    topScores.set(id, 0);
  });

  const top = cfg?.juryPoints?.[0] ?? DEFAULT_TOP_SCORE;

  jury.forEach((vote) => {
    juryPoints.set(
      vote.receiving_country_id,
      (juryPoints.get(vote.receiving_country_id) ?? 0) + vote.points,
    );

    if (vote.points === top) {
      topScores.set(
        vote.receiving_country_id,
        (topScores.get(vote.receiving_country_id) ?? 0) + 1,
      );
    }
  });

  tele.forEach((vote) => {
    telePoints.set(
      vote.country_id,
      (telePoints.get(vote.country_id) ?? 0) + vote.points,
    );
  });

  const juryWeight = (cfg?.weighting.jury ?? 50) / 50;
  const teleWeight = (cfg?.weighting.televote ?? 50) / 50;
  const applyWeighting = cfg?.weightedScoring === true;

  const rows: Standing[] = countryIds.map((id) => {
    const jury = juryPoints.get(id) ?? 0;
    const televote = telePoints.get(id) ?? 0;

    return {
      countryId: id,
      jury,
      televote,
      total: applyWeighting
        ? Math.round(jury * juryWeight + televote * teleWeight)
        : jury + televote,
      rank: 0,
      topPoints: topScores.get(id) ?? 0,
    };
  });

  const chain = cfg?.tieBreak ?? ["televote", "twelves", "jury"];

  rows.sort((a, b) => {
    if (b.total !== a.total) {
      return b.total - a.total;
    }

    for (const rule of chain) {
      if (rule === "televote" && b.televote !== a.televote) {
        return b.televote - a.televote;
      }

      if (rule === "jury" && b.jury !== a.jury) {
        return b.jury - a.jury;
      }

      if (
        (rule === "twelves" || rule === "countback") &&
        b.topPoints !== a.topPoints
      ) {
        return b.topPoints - a.topPoints;
      }

      if (rule === "runningOrder" && runningOrder) {
        const aOrder = runningOrder.get(a.countryId) ?? 999;
        const bOrder = runningOrder.get(b.countryId) ?? 999;

        if (aOrder !== bOrder) {
          return bOrder - aOrder;
        }
      }
    }

    return 0;
  });

  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  return rows;
}

/* ============================================================
   VOTING PAIRS
   ============================================================ */

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
  const resolve = resolveTopScore ?? (() => DEFAULT_TOP_SCORE);

  const map = new Map<string, Pair>();

  votes.forEach((vote) => {
    if (!vote.voter_country_id) {
      return;
    }

    const key = `${vote.voter_country_id}>${vote.receiving_country_id}`;

    const current = map.get(key) ?? {
      from: vote.voter_country_id,
      to: vote.receiving_country_id,
      points: 0,
      topScoreCount: 0,
      count: 0,
    };

    current.points += vote.points;
    current.count += 1;

    if (isTopScore(vote, resolve)) {
      current.topScoreCount += 1;
    }

    map.set(key, current);
  });

  return map;
}

/* ============================================================
   SUPPORTERS / RECIPIENTS
   ============================================================ */

export function topSupporters(
  votes: JuryVote[],
  countryId: string,
  limit = 5,
) {
  const map = new Map<string, number>();

  votes
    .filter((vote) => vote.receiving_country_id === countryId)
    .forEach((vote) => {
      if (!vote.voter_country_id) {
        return;
      }

      map.set(
        vote.voter_country_id,
        (map.get(vote.voter_country_id) ?? 0) + vote.points,
      );
    });

  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

export function topRecipients(
  votes: JuryVote[],
  countryId: string,
  limit = 5,
) {
  const map = new Map<string, number>();

  votes
    .filter((vote) => vote.voter_country_id === countryId)
    .forEach((vote) => {
      map.set(
        vote.receiving_country_id,
        (map.get(vote.receiving_country_id) ?? 0) + vote.points,
      );
    });

  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

/* ============================================================
   VOTING SIMILARITY
   ============================================================ */

export function votingSimilarity(
  votes: JuryVote[],
  countries: Country[],
) {
  const vectors = new Map<string, Map<string, number>>();

  countries.forEach((country) => {
    vectors.set(country.id, new Map());
  });

  votes.forEach((vote) => {
    if (!vote.voter_country_id) {
      return;
    }

    const vector = vectors.get(vote.voter_country_id);

    if (!vector) {
      return;
    }

    vector.set(
      vote.receiving_country_id,
      (vector.get(vote.receiving_country_id) ?? 0) + vote.points,
    );
  });

  const output: Array<{
    a: string;
    b: string;
    score: number;
  }> = [];

  for (let i = 0; i < countries.length; i += 1) {
    for (let j = i + 1; j < countries.length; j += 1) {
      const a = vectors.get(countries[i].id)!;
      const b = vectors.get(countries[j].id)!;

      const keys = new Set([
        ...a.keys(),
        ...b.keys(),
      ]);

      let dot = 0;
      let normA = 0;
      let normB = 0;

      keys.forEach((key) => {
        const x = a.get(key) ?? 0;
        const y = b.get(key) ?? 0;

        dot += x * y;
        normA += x * x;
        normB += y * y;
      });

      output.push({
        a: countries[i].id,
        b: countries[j].id,
        score:
          normA && normB
            ? dot / Math.sqrt(normA * normB)
            : 0,
      });
    }
  }

  return output.sort((a, b) => b.score - a.score);
}

/* ============================================================
   RELATIONSHIPS
   ============================================================ */

export function relationships(
  votes: JuryVote[],
  resolveTopScore?: TopScoreResolver,
) {
  const matrix = pairMatrix(votes, resolveTopScore);

  const seen = new Set<string>();

  const friendships: Array<{
    a: string;
    b: string;
    ab: number;
    ba: number;
    total: number;
  }> = [];

  const oneSided: Array<{
    a: string;
    b: string;
    ab: number;
    ba: number;
    gap: number;
  }> = [];

  matrix.forEach((pair) => {
    const key = [pair.from, pair.to]
      .sort()
      .join("|");

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    const ab = pair.points;

    const ba =
      matrix.get(`${pair.to}>${pair.from}`)?.points ?? 0;

    friendships.push({
      a: pair.from,
      b: pair.to,
      ab,
      ba,
      total: ab + ba,
    });

    const gap = ab - ba;

    if (Math.abs(gap) >= 8) {
      oneSided.push(
        gap > 0
          ? {
              a: pair.from,
              b: pair.to,
              ab,
              ba,
              gap,
            }
          : {
              a: pair.to,
              b: pair.from,
              ab: ba,
              ba: ab,
              gap: -gap,
            },
      );
    }
  });

  return {
    friendships: friendships
      .filter((item) => Math.min(item.ab, item.ba) > 0)
      .sort((a, b) => b.total - a.total),

    oneSided: oneSided.sort((a, b) => b.gap - a.gap),
  };
}

/* ============================================================
   VOTING CLUSTERS
   ============================================================ */

export function votingClusters(
  votes: JuryVote[],
  countries: Country[],
  threshold = 0.6,
) {
  const similarities = votingSimilarity(votes, countries);

  const parent = new Map(
    countries.map((country) => [
      country.id,
      country.id,
    ]),
  );

  const find = (id: string): string => {
    const current = parent.get(id);

    if (!current || current === id) {
      return id;
    }

    const root = find(current);
    parent.set(id, root);

    return root;
  };

  similarities
    .filter((row) => row.score >= threshold)
    .forEach((row) => {
      const aRoot = find(row.a);
      const bRoot = find(row.b);

      if (aRoot !== bRoot) {
        parent.set(aRoot, bRoot);
      }
    });

  const groups = new Map<string, string[]>();

  countries.forEach((country) => {
    const root = find(country.id);

    groups.set(
      root,
      [
        ...(groups.get(root) ?? []),
        country.id,
      ],
    );
  });

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length);
}

/* ============================================================
   REGIONAL BIAS
   ============================================================ */

export function regionalBias(
  votes: JuryVote[],
  countries: Country[],
) {
  const region = new Map(
    countries.map((country) => [
      country.id,
      country.region,
    ]),
  );

  const given = new Map<
    string,
    {
      inRegion: number;
      total: number;
    }
  >();

  votes.forEach((vote) => {
    if (!vote.voter_country_id) {
      return;
    }

    const current = given.get(vote.voter_country_id) ?? {
      inRegion: 0,
      total: 0,
    };

    current.total += vote.points;

    if (
      region.get(vote.voter_country_id) ===
      region.get(vote.receiving_country_id)
    ) {
      current.inRegion += vote.points;
    }

    given.set(vote.voter_country_id, current);
  });

  return [...given.entries()]
    .map(([id, values]) => ({
      id,
      share:
        values.total
          ? values.inRegion / values.total
          : 0,
      ...values,
    }))
    .sort((a, b) => b.share - a.share);
}

/* ============================================================
   COUNTRY PROFILE
   ============================================================ */

export type CountryProfile = {
  participations: number;
  showAppearances: number;

  semiFinalAppearances: number;
  finalAppearances: number;

  qualifications: number;
  nonQualifications: number;

  wins: number;

  best: number | null;
  worst: number | null;
  average: number | null;

  pointsReceived: number;
  pointsGiven: number;

  topScoresReceived: number;
  topScoresGiven: number;

  history: Array<{
    editionNumber: number;
    rank: number | null;
    total: number;
  }>;
};

export function countryProfile(
  countryId: string,
  results: ResultRow[],
  jury: JuryVote[],
  editionNumber: Map<string, number | null>,
  opts?: {
    shows?: Show[];
    resolveTopScore?: TopScoreResolver;
  },
): CountryProfile {
  const resolve =
    opts?.resolveTopScore ??
    makeTopScoreResolver(opts?.shows);

  const kindOf = new Map(
    (opts?.shows ?? []).map((show) => [
      show.id,
      show.kind,
    ]),
  );

  const kind = (result: ResultRow) =>
    result.show_id
      ? kindOf.get(result.show_id)
      : undefined;

  const mine = results.filter(
    (result) => result.country_id === countryId,
  );

  const editionIds = [
    ...new Set(
      mine.map((result) => result.edition_id),
    ),
  ];

  const finals = mine.filter(
    (result) => kind(result) === "grand-final",
  );

  const semis = mine.filter(
    (result) => kind(result) === "semi-final",
  );

  const finalEditionIds = new Set(
    finals.map((result) => result.edition_id),
  );

  const qualifications = semis.filter((result) =>
    finalEditionIds.has(result.edition_id),
  ).length;

  const placementRows =
    opts?.shows?.length
      ? finals.length
        ? finals
        : mine
      : mine;

  const ranks = placementRows
    .map((result) => result.final_rank)
    .filter(
      (rank): rank is number =>
        rank != null,
    );

  const history = editionIds
    .map((editionId) => {
      const rows = mine.filter(
        (result) =>
          result.edition_id === editionId,
      );

      const finalRow = rows.find(
        (result) =>
          kind(result) === "grand-final",
      );

      const best =
        finalRow ??
        [...rows].sort(
          (a, b) =>
            (a.final_rank ?? 999) -
            (b.final_rank ?? 999),
        )[0];

      return {
        editionNumber:
          editionNumber.get(editionId) ?? 0,

        rank:
          best?.final_rank ?? null,

        total:
          best?.total_points ?? 0,
      };
    })
    .sort(
      (a, b) =>
        a.editionNumber - b.editionNumber,
    );

  return {
    participations: editionIds.length,

    showAppearances: mine.length,

    semiFinalAppearances: semis.length,

    finalAppearances: finals.length,

    qualifications,

    nonQualifications:
      semis.length - qualifications,

    wins: finals.length
      ? finals.filter(
          (result) =>
            result.final_rank === 1,
        ).length
      : ranks.filter(
          (rank) =>
            rank === 1,
        ).length,

    best:
      ranks.length
        ? Math.min(...ranks)
        : null,

    worst:
      ranks.length
        ? Math.max(...ranks)
        : null,

    average:
      ranks.length
        ? ranks.reduce(
            (total, rank) =>
              total + rank,
            0,
          ) / ranks.length
        : null,

    pointsReceived: mine.reduce(
      (total, result) =>
        total + result.total_points,
      0,
    ),

    pointsGiven: jury
      .filter(
        (vote) =>
          vote.voter_country_id === countryId,
      )
      .reduce(
        (total, vote) =>
          total + vote.points,
        0,
      ),

    topScoresReceived: jury.filter(
      (vote) =>
        vote.receiving_country_id === countryId &&
        isTopScore(vote, resolve),
    ).length,

    topScoresGiven: jury.filter(
      (vote) =>
        vote.voter_country_id === countryId &&
        isTopScore(vote, resolve),
    ).length,

    history,
  };
}

/* ============================================================
   RECORDS
   ============================================================ */

export type RecordEntry = {
  label: string;
  value: string;
  detail: string;
};

function rankBy(
  rows: ResultRow[],
  value: (result: ResultRow) => number,
): Map<string, number> {
  const sorted = [...rows].sort(
    (a, b) =>
      value(b) - value(a),
  );

  const ranks = new Map<string, number>();

  sorted.forEach((result, index) => {
    const previous = sorted[index - 1];

    ranks.set(
      result.country_id,
      previous &&
        value(previous) === value(result)
        ? ranks.get(previous.country_id)!
        : index + 1,
    );
  });

  return ranks;
}

export function computeRecords(
  results: ResultRow[],
  jury: JuryVote[],
  countries: Country[],
  editionNumber: Map<string, number | null>,
  opts?: {
    shows?: Show[];
    resolveTopScore?: TopScoreResolver;
  },
): RecordEntry[] {
  const resolve =
    opts?.resolveTopScore ??
    makeTopScoreResolver(opts?.shows);

  const showName = new Map(
    (opts?.shows ?? []).map((show) => [
      show.id,
      show.name,
    ]),
  );

  const countryName = new Map(
    countries.map((country) => [
      country.id,
      country.name,
    ]),
  );

  const editionLabel = (id: string) => {
    const number = editionNumber.get(id);

    return number != null
      ? `SSC ${number}`
      : "Edition";
  };

  const context = (result: ResultRow) =>
    [
      editionLabel(result.edition_id),

      result.show_id
        ? showName.get(result.show_id)
        : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const rowLabel = (result: ResultRow) =>
    `${
      countryName.get(result.country_id) ?? "?"
    } · ${context(result)}`;

  if (!results.length) {
    return [];
  }

  const sorted = [...results].sort(
    (a, b) =>
      b.total_points - a.total_points,
  );

  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];

  const winners = results.filter(
    (result) =>
      result.final_rank === 1,
  );

  const lowestWin = [...winners].sort(
    (a, b) =>
      a.total_points - b.total_points,
  )[0];

  /* ----------------------------------------------------------
     Group by show
     ---------------------------------------------------------- */

  const byShow = new Map<string, ResultRow[]>();

  results.forEach((result) => {
    const key =
      result.show_id ??
      `edition:${result.edition_id}`;

    byShow.set(
      key,
      [
        ...(byShow.get(key) ?? []),
        result,
      ],
    );
  });

  /* ----------------------------------------------------------
     Margins
     ---------------------------------------------------------- */

  let biggestMargin = {
    margin: -1,
    text: "—",
  };

  let closest = {
    margin: Number.MAX_SAFE_INTEGER,
    text: "—",
  };

  byShow.forEach((rows) => {
    const ranked = [...rows].sort(
      (a, b) =>
        b.total_points - a.total_points,
    );

    if (ranked.length < 2) {
      return;
    }

    const margin =
      ranked[0].total_points -
      ranked[1].total_points;

    const text =
      `${
        countryName.get(ranked[0].country_id) ?? "?"
      } over ${
        countryName.get(ranked[1].country_id) ?? "?"
      } · ${context(ranked[0])}`;

    if (margin > biggestMargin.margin) {
      biggestMargin = {
        margin,
        text,
      };
    }

    if (margin < closest.margin) {
      closest = {
        margin,
        text,
      };
    }
  });

  /* ----------------------------------------------------------
     Top scores
     ---------------------------------------------------------- */

  const topIn = new Map<string, number>();
  const topOut = new Map<string, number>();

  jury
    .filter((vote) =>
      isTopScore(vote, resolve),
    )
    .forEach((vote) => {
      topIn.set(
        vote.receiving_country_id,
        (topIn.get(vote.receiving_country_id) ?? 0) + 1,
      );

      if (vote.voter_country_id) {
        topOut.set(
          vote.voter_country_id,
          (topOut.get(vote.voter_country_id) ?? 0) + 1,
        );
      }
    });

  const top = (
    map: Map<string, number>,
  ) => {
    const entry = [...map.entries()].sort(
      (a, b) =>
        b[1] - a[1],
    )[0];

    return entry
      ? {
          name:
            countryName.get(entry[0]) ?? "?",
          n: entry[1],
        }
      : {
          name: "—",
          n: 0,
        };
  };

  /* ----------------------------------------------------------
     Jury to final movement

     We use arrays here instead of assigning nullable variables
     from inside forEach callbacks. This keeps strict TypeScript
     happy and avoids the infamous `property does not exist on
     type never` nonsense.
     ---------------------------------------------------------- */

  const movements: Array<{
    places: number;
    row: ResultRow;
  }> = [];

  byShow.forEach((rows) => {
    if (rows.length < 2) {
      return;
    }

    const juryRank = rankBy(
      rows,
      (result) =>
        result.jury_points,
    );

    const finalRank = rankBy(
      rows,
      (result) =>
        result.total_points,
    );

    rows.forEach((result) => {
      const moved =
        (juryRank.get(result.country_id) ?? 0) -
        (finalRank.get(result.country_id) ?? 0);

      if (moved !== 0) {
        movements.push({
          places: moved,
          row: result,
        });
      }
    });
  });

  const comeback =
    movements
      .filter(
        (movement) =>
          movement.places > 0,
      )
      .sort(
        (a, b) =>
          b.places - a.places,
      )[0] ?? null;

  const collapse =
    movements
      .filter(
        (movement) =>
          movement.places < 0,
      )
      .sort(
        (a, b) =>
          a.places - b.places,
      )[0] ?? null;

  /* ----------------------------------------------------------
     Most successful
     ---------------------------------------------------------- */

  const winsBy = new Map<string, number>();

  winners.forEach((winner) => {
    winsBy.set(
      winner.country_id,
      (winsBy.get(winner.country_id) ?? 0) + 1,
    );
  });

  const mostSuccessful =
    top(winsBy);

  /* ----------------------------------------------------------
     Most consistent
     ---------------------------------------------------------- */

  const rankSpread =
    new Map<
      string,
      number[]
    >();

  results.forEach((result) => {
    if (result.final_rank == null) {
      return;
    }

    rankSpread.set(
      result.country_id,
      [
        ...(rankSpread.get(result.country_id) ?? []),
        result.final_rank,
      ],
    );
  });

  const consistencyRows: Array<{
    name: string;
    spread: number;
  }> = [];

  rankSpread.forEach((ranks, id) => {
    if (ranks.length < 2) {
      return;
    }

    consistencyRows.push({
      name:
        countryName.get(id) ?? "?",
      spread:
        Math.max(...ranks) -
        Math.min(...ranks),
    });
  });

  const consistent =
    consistencyRows.sort(
      (a, b) =>
        a.spread - b.spread,
    )[0] ?? null;

  /* ----------------------------------------------------------
     Output
     ---------------------------------------------------------- */

  return [
    {
      label: "Highest score ever",
      value: String(highest.total_points),
      detail: rowLabel(highest),
    },

    {
      label: "Lowest score ever",
      value: String(lowest.total_points),
      detail: rowLabel(lowest),
    },

    {
      label: "Lowest winning score",

      value:
        lowestWin
          ? String(lowestWin.total_points)
          : "—",

      detail:
        lowestWin
          ? rowLabel(lowestWin)
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
          : String(closest.margin),

      detail:
        closest.text,
    },

    {
      label:
        "Most top scores received",

      value:
        String(top(topIn).n),

      detail:
        top(topIn).name,
    },

    {
      label:
        "Most top scores given",

      value:
        String(top(topOut).n),

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
          ? rowLabel(comeback.row)
          : "—",
    },

    {
      label:
        "Biggest collapse (places lost after the jury vote)",

      value:
        collapse
          ? String(collapse.places)
          : "—",

      detail:
        collapse
          ? rowLabel(collapse.row)
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
        consistent
          ? `±${consistent.spread}`
          : "—",

      detail:
        consistent?.name ?? "—",
    },
  ];
}

/* ============================================================
   FALLBACK
   ============================================================ */

export const DEFAULT_TOP_SCORE_FALLBACK =
  DEFAULT_TOP_SCORE;

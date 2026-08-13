import type {
  Edition,
  JuryVote,
  Participant,
  ResultRow,
  Show,
  Televote,
  Voter,
} from "@/lib/data";

export type AdminSeverity =
  | "critical"
  | "action"
  | "warning"
  | "complete";

export type AdminArea =
  | "setup"
  | "entries"
  | "jury"
  | "televote"
  | "results"
  | "publication";

export type AdminIssue = {
  id: string;
  severity: Exclude<
    AdminSeverity,
    "complete"
  >;
  area: AdminArea;
  title: string;
  detail: string;
  tab?: string;
  showId?: string | null;
};

export type ReadinessArea = {
  key: AdminArea;
  label: string;
  status: AdminSeverity;
  complete: number;
  total: number;
};

export type EditionReadiness = {
  status:
    | "ready"
    | "needs-attention"
    | "blocked";
  progress: number;
  issues: AdminIssue[];
  areas: ReadinessArea[];
};

function severityRank(
  value: AdminIssue["severity"],
) {
  if (
    value ===
    "critical"
  ) {
    return 0;
  }

  if (
    value ===
    "action"
  ) {
    return 1;
  }

  return 2;
}

function empty(
  value:
    | string
    | null
    | undefined,
) {
  return (
    !value ||
    !value.trim()
  );
}

export function buildEditionReadiness(
  input: {
    edition: Edition;
    shows: Show[];
    participants: Participant[];
    voters: Voter[];
    juryVotes: JuryVote[];
    televotes: Televote[];
    results: ResultRow[];
  },
): EditionReadiness {
  const {
    edition,
  } = input;

  const shows =
    input.shows.filter(
      (item) =>
        item.edition_id ===
        edition.id,
    );

  const participants =
    input.participants.filter(
      (item) =>
        item.edition_id ===
        edition.id,
    );

  const voters =
    input.voters.filter(
      (item) =>
        item.edition_id ===
        edition.id,
    );

  const juryVotes =
    input.juryVotes.filter(
      (item) =>
        item.edition_id ===
        edition.id,
    );

  const televotes =
    input.televotes.filter(
      (item) =>
        item.edition_id ===
        edition.id,
    );

  const results =
    input.results.filter(
      (item) =>
        item.edition_id ===
        edition.id,
    );

  const issues: AdminIssue[] =
    [];

  /*
   * EDITION SETUP
   */

  if (!shows.length) {
    issues.push({
      id: "no-shows",
      severity:
        "critical",
      area: "setup",
      title:
        "No shows created",
      detail:
        "Create at least one show before operating this edition.",
      tab: "shows",
    });
  }

  if (
    !participants.length
  ) {
    issues.push({
      id: "no-entries",
      severity:
        "critical",
      area:
        "entries",
      title:
        "No entries added",
      detail:
        "Add participating countries and entries.",
      tab:
        "participants",
    });
  }

  /*
   * ENTRY COMPLETENESS
   */

  const missingSongs =
    participants.filter(
      (entry) =>
        empty(
          entry.song,
        ),
    );

  const missingArtists =
    participants.filter(
      (entry) =>
        empty(
          entry.artist,
        ),
    );

  if (
    missingSongs.length
  ) {
    issues.push({
      id:
        "missing-songs",
      severity:
        "action",
      area:
        "entries",
      title:
        `${missingSongs.length} ${
          missingSongs.length ===
          1
            ? "entry has"
            : "entries have"
        } no song`,
      detail:
        "Complete every song title before the contest reaches publication.",
      tab:
        "participants",
    });
  }

  if (
    missingArtists.length
  ) {
    issues.push({
      id:
        "missing-artists",
      severity:
        "action",
      area:
        "entries",
      title:
        `${missingArtists.length} ${
          missingArtists.length ===
          1
            ? "entry has"
            : "entries have"
        } no artist`,
      detail:
        "Complete every artist field.",
      tab:
        "participants",
    });
  }

  /*
   * PER-SHOW CHECKS
   */

  for (
    const show of shows
  ) {
    const entries =
      participants.filter(
        (entry) =>
          entry.show_id ===
          show.id,
      );

    if (
      !entries.length
    ) {
      continue;
    }

    /*
     * RUNNING ORDER
     */

    const running =
      entries
        .map(
          (entry) =>
            entry.running_order,
        )
        .filter(
          (
            value,
          ): value is number =>
            value != null,
        );

    if (
      new Set(running)
        .size !==
      running.length
    ) {
      issues.push({
        id:
          `running-dup-${show.id}`,
        severity:
          "critical",
        area:
          "entries",
        title:
          `${show.name} has duplicate running-order positions`,
        detail:
          "Every running-order position must be unique.",
        tab:
          "participants",
        showId:
          show.id,
      });
    } else if (
      running.length !==
      entries.length
    ) {
      const missing =
        entries.length -
        running.length;

      issues.push({
        id:
          `running-missing-${show.id}`,
        severity:
          "action",
        area:
          "entries",
        title:
          `${show.name}: ${missing} running-order position${
            missing === 1
              ? ""
              : "s"
          } missing`,
        detail:
          `${running.length}/${entries.length} entries are currently placed.`,
        tab:
          "participants",
        showId:
          show.id,
      });
    }

    /*
     * JURY COMPLETENESS
     */

    const expectedVoters =
      voters.filter(
        (voter) =>
          voter.show_id ===
            show.id ||
          voter.show_id ==
            null,
      );

    const showJury =
      juryVotes.filter(
        (vote) =>
          vote.show_id ===
          show.id,
      );

    const completed =
      new Set(
        showJury.map(
          (vote) =>
            vote.voter_id ??
            `country:${vote.voter_country_id}`,
        ),
      );

    const missingVoters =
      expectedVoters.filter(
        (voter) =>
          !completed.has(
            voter.id,
          ) &&
          !(
            voter.country_id &&
            completed.has(
              `country:${voter.country_id}`,
            )
          ),
      );

    if (
      expectedVoters.length &&
      missingVoters.length
    ) {
      issues.push({
        id:
          `jury-${show.id}`,
        severity:
          "action",
        area: "jury",
        title:
          `${show.name}: ${missingVoters.length} jury${
            missingVoters.length ===
            1
              ? ""
              : "ies"
          } missing votes`,
        detail:
          `${expectedVoters.length - missingVoters.length}/${expectedVoters.length} juries received.`,
        tab: "jury",
        showId:
          show.id,
      });
    }

    /*
     * TELEVOTE
     */

    const showTele =
      televotes.filter(
        (vote) =>
          vote.show_id ===
          show.id,
      );

    if (
      !showTele.length
    ) {
      issues.push({
        id:
          `tele-${show.id}`,
        severity:
          "warning",
        area:
          "televote",
        title:
          `${show.name} has no televote data`,
        detail:
          "No televote points have been entered for this show yet.",
        tab:
          "televote",
        showId:
          show.id,
      });
    }

    /*
     * RESULTS
     */

    const showResults =
      results.filter(
        (row) =>
          row.show_id ===
          show.id,
      );

    const brokenTotals =
      showResults.filter(
        (row) =>
          row.total_points !==
          row.jury_points +
            row.televote_points,
      );

    if (
      brokenTotals.length
    ) {
      issues.push({
        id:
          `totals-${show.id}`,
        severity:
          "critical",
        area:
          "results",
        title:
          `${show.name}: ${brokenTotals.length} result total${
            brokenTotals.length ===
            1
              ? " does"
              : "s do"
          } not reconcile`,
        detail:
          "Total points must equal jury points plus televote points.",
        tab:
          "publication",
        showId:
          show.id,
      });
    }

    const incompleteRanks =
      showResults.filter(
        (row) =>
          row.final_rank ==
          null,
      );

    if (
      showResults.length &&
      incompleteRanks.length
    ) {
      issues.push({
        id:
          `ranks-${show.id}`,
        severity:
          "critical",
        area:
          "results",
        title:
          `${show.name} has ${incompleteRanks.length} incomplete final rank${
            incompleteRanks.length ===
            1
              ? ""
              : "s"
          }`,
        detail:
          "Every result row needs a final rank before final publication.",
        tab:
          "publication",
        showId:
          show.id,
      });
    }

    /*
     * DUPLICATE FINAL RANKS
     */

    const ranks =
      showResults
        .map(
          (row) =>
            row.final_rank,
        )
        .filter(
          (
            rank,
          ): rank is number =>
            rank != null,
        );

    if (
      ranks.length &&
      new Set(ranks)
        .size !==
        ranks.length
    ) {
      issues.push({
        id:
          `duplicate-ranks-${show.id}`,
        severity:
          "warning",
        area:
          "results",
        title:
          `${show.name} contains duplicate final ranks`,
        detail:
          "Review tied or duplicated placements before publication.",
        tab:
          "publication",
        showId:
          show.id,
      });
    }

    /*
     * RESULT PARTICIPANT COUNT
     */

    if (
      showResults.length &&
      showResults.length !==
        entries.length
    ) {
      issues.push({
        id:
          `result-count-${show.id}`,
        severity:
          "critical",
        area:
          "results",
        title:
          `${show.name} results do not match the participant count`,
        detail:
          `${entries.length} entries exist, but ${showResults.length} result rows exist.`,
        tab:
          "publication",
        showId:
          show.id,
      });
    }
  }

  /*
   * PUBLICATION STATUS
   */

  const publicShows =
    shows.filter(
      (show) =>
        show.published,
    );

  if (
    publicShows.length &&
    issues.some(
      (issue) =>
        issue.severity ===
        "critical",
    )
  ) {
    issues.push({
      id:
        "public-with-blockers",
      severity:
        "critical",
      area:
        "publication",
      title:
        "Public contest data currently has blocking integrity issues",
      detail:
        "Resolve the critical readiness issues before publishing additional contest information.",
      tab:
        "publication",
    });
  }

  /*
   * AREA STATUS
   */

  const areas: ReadinessArea[] =
    [
      makeArea(
        "setup",
        "Setup",
        Math.max(
          shows.length,
          1,
        ),
        issues,
      ),

      makeArea(
        "entries",
        "Entries",
        Math.max(
          participants.length,
          1,
        ),
        issues,
      ),

      makeArea(
        "jury",
        "Juries",
        Math.max(
          voters.length,
          1,
        ),
        issues,
      ),

      makeArea(
        "televote",
        "Televote",
        1,
        issues,
      ),

      makeArea(
        "results",
        "Results",
        Math.max(
          results.length,
          1,
        ),
        issues,
      ),

      makeArea(
        "publication",
        "Publication",
        1,
        issues,
      ),
    ];

  const failedAreas =
    new Set(
      issues.map(
        (issue) =>
          issue.area,
      ),
    );

  const completeAreas =
    areas.filter(
      (item) =>
        !failedAreas.has(
          item.key,
        ),
    ).length;

  const hasCritical =
    issues.some(
      (issue) =>
        issue.severity ===
        "critical",
    );

  return {
    status:
      hasCritical
        ? "blocked"
        : issues.length
          ? "needs-attention"
          : "ready",

    progress:
      Math.round(
        (
          completeAreas /
          areas.length
        ) *
          100,
      ),

    issues:
      issues.sort(
        (a, b) =>
          severityRank(
            a.severity,
          ) -
          severityRank(
            b.severity,
          ),
      ),

    areas,
  };
}

function makeArea(
  key: AdminArea,
  label: string,
  total: number,
  issues: AdminIssue[],
): ReadinessArea {
  const related =
    issues.filter(
      (issue) =>
        issue.area ===
        key,
    );

  let status: AdminSeverity =
    "complete";

  if (
    related.some(
      (issue) =>
        issue.severity ===
        "critical",
    )
  ) {
    status =
      "critical";
  } else if (
    related.some(
      (issue) =>
        issue.severity ===
        "action",
    )
  ) {
    status =
      "action";
  } else if (
    related.length
  ) {
    status =
      "warning";
  }

  return {
    key,
    label,
    status,
    complete:
      related.length
        ? 0
        : total,
    total,
  };
}

import type { JuryBallotStatus } from "@/lib/admin-readiness-data";
import {
  matchVoterKey,
  voterOptionsFromVoters,
  type Edition,
  type JuryVote,
  type Participant,
  type ResultRow,
  type Show,
  type Televote,
  type Voter,
  type VoterOption,
} from "@/lib/data";
import { resolveVoting } from "@/lib/voting";

export type AdminSeverity = "critical" | "action" | "warning" | "complete";
export type AdminArea = "setup" | "entries" | "jury" | "televote" | "results" | "publication";

export type AdminIssue = {
  id: string;
  severity: Exclude<AdminSeverity, "complete">;
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
  status: "ready" | "needs-attention" | "blocked";
  progress: number;
  issues: AdminIssue[];
  areas: ReadinessArea[];
};

function severityRank(value: AdminIssue["severity"]) {
  if (value === "critical") return 0;
  if (value === "action") return 1;
  return 2;
}

function empty(value: string | null | undefined) {
  return !value || !value.trim();
}

function makeArea(key: AdminArea, label: string, total: number, issues: AdminIssue[]): ReadinessArea {
  const related = issues.filter((issue) => issue.area === key);
  let status: AdminSeverity = "complete";

  if (related.some((issue) => issue.severity === "critical")) status = "critical";
  else if (related.some((issue) => issue.severity === "action")) status = "action";
  else if (related.length) status = "warning";

  return {
    key,
    label,
    status,
    complete: related.length ? 0 : total,
    total,
  };
}

function matchBallotStatusKey(status: JuryBallotStatus, options: VoterOption[]) {
  if (status.voter_id) {
    const direct = options.find((option) => option.voterId === status.voter_id);
    if (direct) return direct.key;
  }

  if (status.voter_entity_id) {
    const byEntity = options.find((option) => option.countryId === status.voter_entity_id);
    if (byEntity) return byEntity.key;
  }

  if (status.voter_country_id) {
    const byCountry = options.find((option) => option.countryId === status.voter_country_id);
    if (byCountry) return byCountry.key;
    return `c:${status.voter_country_id}`;
  }

  return status.voter_id ? `v:${status.voter_id}` : "";
}

export function buildEditionReadiness(input: {
  edition: Edition;
  shows: Show[];
  participants: Participant[];
  voters: Voter[];
  juryVotes: JuryVote[];
  juryBallotStatuses: JuryBallotStatus[];
  televotes: Televote[];
  results: ResultRow[];
}): EditionReadiness {
  const { edition } = input;

  const shows = input.shows.filter((row) => row.edition_id === edition.id);
  const participants = input.participants.filter((row) => row.edition_id === edition.id);
  const voters = input.voters.filter((row) => row.edition_id === edition.id);
  const juryVotes = input.juryVotes.filter((row) => row.edition_id === edition.id);
  const juryBallotStatuses = input.juryBallotStatuses.filter((row) => row.edition_id === edition.id);
  const televotes = input.televotes.filter((row) => row.edition_id === edition.id);
  const results = input.results.filter((row) => row.edition_id === edition.id);
  const issues: AdminIssue[] = [];

  if (!shows.length) {
    issues.push({
      id: "no-shows",
      severity: "critical",
      area: "setup",
      title: "No shows created",
      detail: "Create at least one show before operating this edition.",
      tab: "shows",
    });
  }

  if (!participants.length) {
    issues.push({
      id: "no-entries",
      severity: "critical",
      area: "entries",
      title: "No entries added",
      detail: "Add participating countries and entries.",
      tab: "participants",
    });
  }

  const missingSongs = participants.filter((entry) => empty(entry.song));
  const missingArtists = participants.filter((entry) => empty(entry.artist));

  if (missingSongs.length) {
    issues.push({
      id: "missing-songs",
      severity: "action",
      area: "entries",
      title: `${missingSongs.length} ${missingSongs.length === 1 ? "entry has" : "entries have"} no song`,
      detail: "Complete every song title before the contest reaches publication.",
      tab: "participants",
    });
  }

  if (missingArtists.length) {
    issues.push({
      id: "missing-artists",
      severity: "action",
      area: "entries",
      title: `${missingArtists.length} ${missingArtists.length === 1 ? "entry has" : "entries have"} no artist`,
      detail: "Complete every artist field.",
      tab: "participants",
    });
  }

  for (const show of shows) {
    const entries = participants.filter((entry) => entry.show_id === show.id);

    if (!entries.length) {
      if (show.published) {
        issues.push({
          id: `empty-show-${show.id}`,
          severity: "warning",
          area: "entries",
          title: `${show.name} is public but has no participants`,
          detail: "Add participants or make the show private until its line-up is ready.",
          tab: "participants",
          showId: show.id,
        });
      }
      continue;
    }

    const running = entries
      .map((entry) => entry.running_order)
      .filter((value): value is number => value != null);

    if (new Set(running).size !== running.length) {
      issues.push({
        id: `running-dup-${show.id}`,
        severity: "critical",
        area: "entries",
        title: `${show.name} has duplicate running-order positions`,
        detail: "Every running-order position must be unique.",
        tab: "participants",
        showId: show.id,
      });
    } else if (running.length !== entries.length) {
      const missing = entries.length - running.length;
      issues.push({
        id: `running-missing-${show.id}`,
        severity: "action",
        area: "entries",
        title: `${show.name}: ${missing} running-order position${missing === 1 ? "" : "s"} missing`,
        detail: `${running.length}/${entries.length} entries are currently placed.`,
        tab: "participants",
        showId: show.id,
      });
    }

    /*
     * Jury readiness deliberately uses exactly the same voter resolver and
     * completeness rule as FastJuryEntry. An explicit did-not-vote status is
     * a resolved absence, never a fabricated zero-point ballot.
     */
    const showVoters = voters.filter((voter) => voter.show_id === show.id);
    const showJury = juryVotes.filter((vote) => vote.show_id === show.id);
    const showStatuses = juryBallotStatuses.filter((status) => status.show_id === show.id);
    const voting = resolveVoting(show.voting_config);
    const requiredRows = voting.juryPoints.length;

    if (showVoters.length && requiredRows > 0) {
      // Country metadata is only used for display in voterOptionsFromVoters;
      // voter keys and canonical identity do not depend on it.
      const voterOptions = voterOptionsFromVoters(showVoters, []);
      const counts = new Map<string, number>();

      for (const vote of showJury) {
        const key = matchVoterKey(vote, voterOptions);
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const didNotVoteKeys = new Set(
        showStatuses
          .filter((status) => status.status === "did_not_vote")
          .map((status) => matchBallotStatusKey(status, voterOptions))
          .filter(Boolean),
      );

      const conflicts = voterOptions.filter(
        (voter) => didNotVoteKeys.has(voter.key) && (counts.get(voter.key) ?? 0) > 0,
      );

      if (conflicts.length) {
        issues.push({
          id: `jury-status-conflict-${show.id}`,
          severity: "critical",
          area: "jury",
          title: `${show.name}: ${conflicts.length} jury status conflict${conflicts.length === 1 ? "" : "s"}`,
          detail: "A jury is marked did not vote but also has saved scores. Restore the ballot status or clear its scores before publication.",
          tab: "jury",
          showId: show.id,
        });
      }

      const incomplete = voterOptions.filter(
        (voter) => !didNotVoteKeys.has(voter.key) && (counts.get(voter.key) ?? 0) < requiredRows,
      );
      const didNotVoteCount = voterOptions.filter((voter) => didNotVoteKeys.has(voter.key)).length;
      const completeCount = voterOptions.filter(
        (voter) => !didNotVoteKeys.has(voter.key) && (counts.get(voter.key) ?? 0) >= requiredRows,
      ).length;

      if (incomplete.length) {
        issues.push({
          id: `jury-${show.id}`,
          severity: "action",
          area: "jury",
          title: `${show.name}: ${incomplete.length} ${incomplete.length === 1 ? "jury has" : "juries have"} incomplete votes`,
          detail: `${completeCount} complete · ${didNotVoteCount} did not vote · ${incomplete.length} remaining of ${voterOptions.length}.`,
          tab: "jury",
          showId: show.id,
        });
      }

      const invalidCount = voterOptions.filter((voter) => {
        const ballot = showJury.filter(
          (vote) => matchVoterKey(vote, voterOptions) === voter.key,
        );
        if (!ballot.length) return false;

        const points = ballot.map((vote) => vote.points);
        const unique = new Set(points);
        return (
          unique.size !== points.length ||
          points.some((point) => !voting.juryPoints.includes(point))
        );
      }).length;

      if (invalidCount) {
        issues.push({
          id: `jury-invalid-${show.id}`,
          severity: "critical",
          area: "jury",
          title: `${show.name}: ${invalidCount} jury ballot${invalidCount === 1 ? " is" : "s are"} invalid`,
          detail: "At least one jury contains duplicate or unexpected point values.",
          tab: "jury",
          showId: show.id,
        });
      }
    }

    const showTele = televotes.filter((vote) => vote.show_id === show.id);
    const hasVotingActivity =
      showJury.length > 0 || results.some((row) => row.show_id === show.id);

    if (!showTele.length && hasVotingActivity) {
      issues.push({
        id: `tele-${show.id}`,
        severity: "warning",
        area: "televote",
        title: `${show.name} has no televote data`,
        detail: "No televote points have been entered for this show yet.",
        tab: "televote",
        showId: show.id,
      });
    }

    const showResults = results.filter((row) => row.show_id === show.id);
    const brokenTotals = showResults.filter(
      (row) => row.total_points !== row.jury_points + row.televote_points,
    );

    if (brokenTotals.length) {
      issues.push({
        id: `totals-${show.id}`,
        severity: "critical",
        area: "results",
        title: `${show.name}: ${brokenTotals.length} result total${brokenTotals.length === 1 ? " does" : "s do"} not reconcile`,
        detail: "Total points must equal jury points plus televote points.",
        tab: "publication",
        showId: show.id,
      });
    }

    const incompleteRanks = showResults.filter((row) => row.final_rank == null);

    if (showResults.length && incompleteRanks.length) {
      issues.push({
        id: `ranks-${show.id}`,
        severity: "critical",
        area: "results",
        title: `${show.name} has ${incompleteRanks.length} incomplete final rank${incompleteRanks.length === 1 ? "" : "s"}`,
        detail: "Every result row needs a final rank before final publication.",
        tab: "publication",
        showId: show.id,
      });
    }

    const ranks = showResults
      .map((row) => row.final_rank)
      .filter((rank): rank is number => rank != null);

    if (ranks.length && new Set(ranks).size !== ranks.length) {
      issues.push({
        id: `duplicate-ranks-${show.id}`,
        severity: "warning",
        area: "results",
        title: `${show.name} contains tied or duplicate final ranks`,
        detail: "This may be intentional. Review the placements before publication.",
        tab: "publication",
        showId: show.id,
      });
    }

    if (showResults.length && showResults.length !== entries.length) {
      issues.push({
        id: `result-count-${show.id}`,
        severity: "critical",
        area: "results",
        title: `${show.name} results do not match the participant count`,
        detail: `${entries.length} entries exist, but ${showResults.length} result rows exist.`,
        tab: "publication",
        showId: show.id,
      });
    }
  }

  const publicShows = shows.filter((show) => show.published);
  const criticalIssues = issues.filter((issue) => issue.severity === "critical");

  if (publicShows.length && criticalIssues.length) {
    issues.push({
      id: "public-with-blockers",
      severity: "critical",
      area: "publication",
      title: "Public contest data currently has blocking integrity issues",
      detail: "Resolve the critical readiness issues before publishing additional contest information.",
      tab: "publication",
    });
  }

  const areas: ReadinessArea[] = [
    makeArea("setup", "Setup", Math.max(shows.length, 1), issues),
    makeArea("entries", "Entries", Math.max(participants.length, 1), issues),
    makeArea("jury", "Juries", 1, issues),
    makeArea("televote", "Televote", 1, issues),
    makeArea("results", "Results", Math.max(results.length, 1), issues),
    makeArea("publication", "Publication", 1, issues),
  ];

  const failedAreas = new Set(issues.map((issue) => issue.area));
  const completeAreas = areas.filter((area) => !failedAreas.has(area.key)).length;
  const hasCritical = issues.some((issue) => issue.severity === "critical");

  return {
    status: hasCritical ? "blocked" : issues.length ? "needs-attention" : "ready",
    progress: Math.round((completeAreas / areas.length) * 100),
    issues: issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    areas,
  };
}

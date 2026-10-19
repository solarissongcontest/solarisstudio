import { createServerFn } from "@tanstack/react-start";

type VotingRecommendedAction = {
  kind: string;
  label: string;
  route: string;
  reason: string;
};

type VotingJuryShowSummary = {
  showId: string;
  showName: string;
  showKind: string | null;
  showStatus: string | null;
  juryEnabled: boolean;
  configured: boolean;
  windowStatus: string;
  expected: number;
  submitted: number;
  valid: number;
  needsReview: number;
  invalidated: number;
  superseded: number;
  didNotVote: number;
  missing: number;
  blockers: number;
  reviewVersion: number;
};

export type OrganizerVotingOverview = {
  schemaVersion: number;
  stateVersion: string;
  serverTime: string;
  edition: {
    id: string;
    slug: string | null;
    name: string;
    editionNumber: number | null;
    status: string | null;
  };
  jury: {
    state: "not_configured" | "attention" | "active" | "ready";
    showCount: number;
    enabledShowCount: number;
    configuredShowCount: number;
    unconfiguredShowCount: number;
    showSummaryLimit: number;
    showSummaryTruncated: boolean;
    expected: number;
    submitted: number;
    valid: number;
    needsReview: number;
    invalidated: number;
    superseded: number;
    didNotVote: number;
    missing: number;
    openWindows: number;
    blockerCount: number;
    shows: VotingJuryShowSummary[];
  };
  televote: {
    linked: boolean;
    rounds: number;
    openRounds: number;
    submissions: number;
    blocked: number;
    remoteEditionId: string | null;
  };
  integrity: {
    outstanding: number;
    juryNeedsReview: number;
    juryInvalidated: number;
    televoteBlocked: number;
    severity: "none" | "attention";
  };
  results: {
    authority: "organizer-results-projection";
    route: "/admin/results";
    note: string;
  };
  recommendedAction: VotingRecommendedAction | null;

  // Compatibility aliases for older cards while O7/O8 consumers converge on
  // the nested canonical projection.
  editions: number;
  rounds: number;
  openRounds: number;
  submissions: number;
  blocked: number;
  activeEdition: string;
  remoteEditionId: string | null;
  linked: boolean;
};

type VotingOverviewRpcClient = {
  rpc(
    name: "studio2_organizer_voting_overview",
    args: { p_edition_id: string },
  ): PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function boolValue(value: unknown) {
  return value === true;
}

function parseJuryShow(value: unknown): VotingJuryShowSummary | null {
  const row = record(value);
  const showId = stringOrNull(row.showId);
  const showName = stringOrNull(row.showName);
  if (!showId || !showName) return null;

  return {
    showId,
    showName,
    showKind: stringOrNull(row.showKind),
    showStatus: stringOrNull(row.showStatus),
    juryEnabled: boolValue(row.juryEnabled),
    configured: boolValue(row.configured),
    windowStatus: stringValue(row.windowStatus, "closed"),
    expected: numberValue(row.expected),
    submitted: numberValue(row.submitted),
    valid: numberValue(row.valid),
    needsReview: numberValue(row.needsReview),
    invalidated: numberValue(row.invalidated),
    superseded: numberValue(row.superseded),
    didNotVote: numberValue(row.didNotVote),
    missing: numberValue(row.missing),
    blockers: numberValue(row.blockers),
    reviewVersion: numberValue(row.reviewVersion),
  };
}

function parseRecommendedAction(value: unknown): VotingRecommendedAction | null {
  const row = record(value);
  const kind = stringOrNull(row.kind);
  const label = stringOrNull(row.label);
  const route = stringOrNull(row.route);
  const reason = stringOrNull(row.reason);
  if (!kind || !label || !route || !reason) return null;
  return { kind, label, route, reason };
}

function parseOverview(value: unknown, expectedEditionId: string): OrganizerVotingOverview {
  const root = record(value);
  const edition = record(root.edition);
  const jury = record(root.jury);
  const televote = record(root.televote);
  const integrity = record(root.integrity);
  const results = record(root.results);
  const editionId = stringOrNull(edition.id);
  const editionName = stringOrNull(edition.name);
  const stateVersion = stringOrNull(root.stateVersion);
  const serverTime = stringOrNull(root.serverTime);

  if (!editionId || editionId !== expectedEditionId) {
    throw new Error("Voting overview returned a different Organizer edition scope.");
  }
  if (!editionName || !stateVersion || !serverTime) {
    throw new Error("Voting overview is missing canonical reconciliation metadata.");
  }

  const juryState = stringValue(jury.state, "not_configured");
  if (!["not_configured", "attention", "active", "ready"].includes(juryState)) {
    throw new Error("Voting overview returned an unsupported Jury state.");
  }

  const authority = stringValue(results.authority);
  const resultsRoute = stringValue(results.route);
  if (authority !== "organizer-results-projection" || resultsRoute !== "/admin/results") {
    throw new Error("Voting overview returned an unsupported Results authority reference.");
  }

  const shows = Array.isArray(jury.shows)
    ? jury.shows.flatMap((item) => {
        const parsed = parseJuryShow(item);
        return parsed ? [parsed] : [];
      })
    : [];

  const parsed: OrganizerVotingOverview = {
    schemaVersion: numberValue(root.schemaVersion),
    stateVersion,
    serverTime,
    edition: {
      id: editionId,
      slug: stringOrNull(edition.slug),
      name: editionName,
      editionNumber:
        typeof edition.editionNumber === "number" ? edition.editionNumber : null,
      status: stringOrNull(edition.status),
    },
    jury: {
      state: juryState as OrganizerVotingOverview["jury"]["state"],
      showCount: numberValue(jury.showCount),
      enabledShowCount: numberValue(jury.enabledShowCount),
      configuredShowCount: numberValue(jury.configuredShowCount),
      unconfiguredShowCount: numberValue(jury.unconfiguredShowCount),
      showSummaryLimit: numberValue(jury.showSummaryLimit),
      showSummaryTruncated: boolValue(jury.showSummaryTruncated),
      expected: numberValue(jury.expected),
      submitted: numberValue(jury.submitted),
      valid: numberValue(jury.valid),
      needsReview: numberValue(jury.needsReview),
      invalidated: numberValue(jury.invalidated),
      superseded: numberValue(jury.superseded),
      didNotVote: numberValue(jury.didNotVote),
      missing: numberValue(jury.missing),
      openWindows: numberValue(jury.openWindows),
      blockerCount: numberValue(jury.blockerCount),
      shows,
    },
    televote: {
      linked: boolValue(televote.linked),
      rounds: numberValue(televote.rounds),
      openRounds: numberValue(televote.openRounds),
      submissions: numberValue(televote.submissions),
      blocked: numberValue(televote.blocked),
      remoteEditionId: stringOrNull(televote.remoteEditionId),
    },
    integrity: {
      outstanding: numberValue(integrity.outstanding),
      juryNeedsReview: numberValue(integrity.juryNeedsReview),
      juryInvalidated: numberValue(integrity.juryInvalidated),
      televoteBlocked: numberValue(integrity.televoteBlocked),
      severity: integrity.severity === "attention" ? "attention" : "none",
    },
    results: {
      authority: "organizer-results-projection",
      route: "/admin/results",
      note: stringValue(results.note),
    },
    recommendedAction: parseRecommendedAction(root.recommendedAction),
    editions: 1,
    rounds: numberValue(televote.rounds),
    openRounds: numberValue(televote.openRounds),
    submissions: numberValue(televote.submissions),
    blocked: numberValue(televote.blocked),
    activeEdition: editionName,
    remoteEditionId: stringOrNull(televote.remoteEditionId),
    linked: boolValue(televote.linked),
  };

  if (parsed.jury.shows.length > parsed.jury.showSummaryLimit) {
    throw new Error("Voting overview exceeded its bounded Jury show projection.");
  }

  return parsed;
}

export const getMergedTelevotingOverview = createServerFn({ method: "POST" })
  .inputValidator((data: { editionId?: string | null } | undefined) => ({
    editionId: data?.editionId ? String(data.editionId) : null,
  }))
  .handler(async ({ data }) => {
    if (!data.editionId) {
      throw new Error("Explicit Organizer edition is required for Voting overview.");
    }

    const [
      { requireMergedTelevotingAdminServer },
      { createSolarisAuthenticatedClientServer },
    ] = await Promise.all([
      import("@/integrations/televoting/admin-session.server"),
      import("@/integrations/supabase/organizer.server"),
    ]);

    await requireMergedTelevotingAdminServer();
    const client =
      createSolarisAuthenticatedClientServer() as unknown as VotingOverviewRpcClient;
    const { data: rawSummary, error } = await client.rpc(
      "studio2_organizer_voting_overview",
      { p_edition_id: data.editionId },
    );
    if (error) throw new Error(error.message || "Voting overview could not be loaded.");

    return parseOverview(rawSummary, data.editionId);
  });

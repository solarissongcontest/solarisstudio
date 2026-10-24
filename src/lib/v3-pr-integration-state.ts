export type V3PrCheckStatus = "queued" | "in_progress" | "completed";

export type V3PrCheckConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "timed_out"
  | "action_required"
  | "neutral"
  | "skipped"
  | null;

export type V3PrCheckEvidence = {
  name: string;
  headSha: string;
  status: V3PrCheckStatus;
  conclusion: V3PrCheckConclusion;
};

export type V3PrDependencyEvidence = {
  number: number;
  state: "open" | "merged" | "closed";
  headSha?: string;
};

export type V3PrIntegrationCandidate = {
  number: number;
  title: string;
  headRef: string;
  baseRef: string;
  headSha: string;
  draft?: boolean;
  mergeable?: boolean | null;
  behindMainBy?: number | null;
  requiredChecks: string[];
  checks: V3PrCheckEvidence[];
  dependencies?: V3PrDependencyEvidence[];
};

export type V3PrIntegrationSnapshot = {
  repository: string;
  mainSha: string;
  candidates: V3PrIntegrationCandidate[];
};

export type V3PrIntegrationState =
  | "blocked_dependency"
  | "merge_conflict"
  | "waiting_dependency"
  | "stacked_reconcile_required"
  | "needs_reconcile"
  | "main_sync_unknown"
  | "missing_evidence"
  | "stale_evidence"
  | "ci_failed"
  | "ci_pending"
  | "exact_head_verified";

export type V3PrIntegrationRow = {
  number: number;
  title: string;
  headRef: string;
  baseRef: string;
  headSha: string;
  draft: boolean;
  mergeable: boolean | null;
  behindMainBy: number | null;
  state: V3PrIntegrationState;
  blockers: string[];
  requiredChecks: string[];
  exactHeadChecksPassed: string[];
  missingChecks: string[];
  staleChecks: string[];
  pendingChecks: string[];
  failedChecks: string[];
  openDependencies: number[];
  closedUnmergedDependencies: number[];
  certificationClaim: false;
};

export type V3PrIntegrationReport = {
  schemaVersion: 1;
  repository: string;
  mainSha: string;
  candidateCount: number;
  stateCounts: Record<V3PrIntegrationState, number>;
  candidates: V3PrIntegrationRow[];
  certificationClaim: false;
  mergeAuthorizationClaim: false;
  productionTrafficGenerated: false;
};

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

const STATE_ORDER: V3PrIntegrationState[] = [
  "blocked_dependency",
  "merge_conflict",
  "waiting_dependency",
  "stacked_reconcile_required",
  "needs_reconcile",
  "main_sync_unknown",
  "missing_evidence",
  "stale_evidence",
  "ci_failed",
  "ci_pending",
  "exact_head_verified",
];

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

function validateSha(value: string, label: string) {
  if (!SHA_PATTERN.test(value)) {
    throw new Error(`${label} must be an exact 40-character SHA`);
  }
}

function validateCandidate(candidate: V3PrIntegrationCandidate) {
  if (!Number.isInteger(candidate.number) || candidate.number <= 0) {
    throw new Error("PR integration candidate has an invalid pull request number");
  }
  if (!candidate.title.trim() || !candidate.headRef.trim() || !candidate.baseRef.trim()) {
    throw new Error(`PR #${candidate.number} has incomplete identity`);
  }
  validateSha(candidate.headSha, `PR #${candidate.number} head SHA`);

  if (
    candidate.behindMainBy !== undefined &&
    candidate.behindMainBy !== null &&
    (!Number.isInteger(candidate.behindMainBy) || candidate.behindMainBy < 0)
  ) {
    throw new Error(`PR #${candidate.number} has invalid behindMainBy`);
  }

  const requiredChecks = unique(candidate.requiredChecks);
  if (requiredChecks.length !== candidate.requiredChecks.length) {
    throw new Error(`PR #${candidate.number} has duplicate required check names`);
  }
  if (requiredChecks.some((name) => !name.trim())) {
    throw new Error(`PR #${candidate.number} has a blank required check name`);
  }

  const checkNames = candidate.checks.map((check) => check.name);
  if (unique(checkNames).length !== checkNames.length) {
    throw new Error(`PR #${candidate.number} has duplicate check evidence names`);
  }
  for (const check of candidate.checks) {
    if (!check.name.trim()) {
      throw new Error(`PR #${candidate.number} has blank check evidence name`);
    }
    validateSha(check.headSha, `PR #${candidate.number} check ${check.name} head SHA`);
  }

  const dependencies = candidate.dependencies ?? [];
  const dependencyNumbers = dependencies.map((dependency) => dependency.number);
  if (unique(dependencyNumbers.map(String)).length !== dependencyNumbers.length) {
    throw new Error(`PR #${candidate.number} has duplicate dependency evidence`);
  }
  for (const dependency of dependencies) {
    if (!Number.isInteger(dependency.number) || dependency.number <= 0) {
      throw new Error(`PR #${candidate.number} has invalid dependency number`);
    }
    if (dependency.number === candidate.number) {
      throw new Error(`PR #${candidate.number} cannot depend on itself`);
    }
    if (dependency.headSha !== undefined) {
      validateSha(
        dependency.headSha,
        `PR #${candidate.number} dependency #${dependency.number} head SHA`,
      );
    }
  }
}

function assessChecks(candidate: V3PrIntegrationCandidate) {
  const byName = new Map(candidate.checks.map((check) => [check.name, check]));
  const missingChecks: string[] = [];
  const staleChecks: string[] = [];
  const pendingChecks: string[] = [];
  const failedChecks: string[] = [];
  const exactHeadChecksPassed: string[] = [];

  for (const requiredName of candidate.requiredChecks) {
    const check = byName.get(requiredName);
    if (!check) {
      missingChecks.push(requiredName);
      continue;
    }
    if (check.headSha.toLowerCase() !== candidate.headSha.toLowerCase()) {
      staleChecks.push(requiredName);
      continue;
    }
    if (check.status !== "completed" || check.conclusion === null) {
      pendingChecks.push(requiredName);
      continue;
    }
    if (check.conclusion !== "success") {
      failedChecks.push(requiredName);
      continue;
    }
    exactHeadChecksPassed.push(requiredName);
  }

  return {
    missingChecks,
    staleChecks,
    pendingChecks,
    failedChecks,
    exactHeadChecksPassed,
  };
}

function assessCandidate(candidate: V3PrIntegrationCandidate): V3PrIntegrationRow {
  validateCandidate(candidate);

  const checks = assessChecks(candidate);
  const dependencies = candidate.dependencies ?? [];
  const openDependencies = dependencies
    .filter((dependency) => dependency.state === "open")
    .map((dependency) => dependency.number)
    .sort((a, b) => a - b);
  const closedUnmergedDependencies = dependencies
    .filter((dependency) => dependency.state === "closed")
    .map((dependency) => dependency.number)
    .sort((a, b) => a - b);

  const blockers: string[] = [];
  let state: V3PrIntegrationState;

  if (closedUnmergedDependencies.length > 0) {
    state = "blocked_dependency";
    blockers.push(
      `Dependency PR(s) ${closedUnmergedDependencies.map((number) => `#${number}`).join(", ")} closed without merge`,
    );
  } else if (candidate.mergeable === false) {
    state = "merge_conflict";
    blockers.push("GitHub reports the current PR head/base pair as not mergeable");
  } else if (openDependencies.length > 0) {
    state = "waiting_dependency";
    blockers.push(
      `Open dependency PR(s): ${openDependencies.map((number) => `#${number}`).join(", ")}`,
    );
  } else if (candidate.baseRef !== "main") {
    state = "stacked_reconcile_required";
    blockers.push(
      `PR targets ${candidate.baseRef}; after its stack lands, reconcile this exact delta onto current main and rerun exact-head evidence`,
    );
  } else if (typeof candidate.behindMainBy === "number" && candidate.behindMainBy > 0) {
    state = "needs_reconcile";
    blockers.push(
      `PR is ${candidate.behindMainBy} commit${candidate.behindMainBy === 1 ? "" : "s"} behind current main`,
    );
  } else if (candidate.behindMainBy === undefined || candidate.behindMainBy === null) {
    state = "main_sync_unknown";
    blockers.push("Current-main ancestry has not been measured for this PR head");
  } else if (checks.missingChecks.length > 0) {
    state = "missing_evidence";
    blockers.push(`Required checks missing: ${checks.missingChecks.join(", ")}`);
  } else if (checks.staleChecks.length > 0) {
    state = "stale_evidence";
    blockers.push(
      `Required checks belong to an older/different head SHA: ${checks.staleChecks.join(", ")}`,
    );
  } else if (checks.failedChecks.length > 0) {
    state = "ci_failed";
    blockers.push(`Required checks failed: ${checks.failedChecks.join(", ")}`);
  } else if (checks.pendingChecks.length > 0) {
    state = "ci_pending";
    blockers.push(`Required checks still pending: ${checks.pendingChecks.join(", ")}`);
  } else {
    state = "exact_head_verified";
  }

  return {
    number: candidate.number,
    title: candidate.title,
    headRef: candidate.headRef,
    baseRef: candidate.baseRef,
    headSha: candidate.headSha.toLowerCase(),
    draft: candidate.draft === true,
    mergeable: candidate.mergeable ?? null,
    behindMainBy: candidate.behindMainBy ?? null,
    state,
    blockers,
    requiredChecks: [...candidate.requiredChecks],
    exactHeadChecksPassed: checks.exactHeadChecksPassed,
    missingChecks: checks.missingChecks,
    staleChecks: checks.staleChecks,
    pendingChecks: checks.pendingChecks,
    failedChecks: checks.failedChecks,
    openDependencies,
    closedUnmergedDependencies,
    certificationClaim: false,
  };
}

export function buildV3PrIntegrationReport(
  snapshot: V3PrIntegrationSnapshot,
): V3PrIntegrationReport {
  if (!snapshot.repository.trim()) {
    throw new Error("PR integration snapshot is missing repository identity");
  }
  validateSha(snapshot.mainSha, "PR integration snapshot main SHA");

  const numbers = snapshot.candidates.map((candidate) => candidate.number);
  if (new Set(numbers).size !== numbers.length) {
    throw new Error("PR integration snapshot contains duplicate pull request candidates");
  }

  const candidates = snapshot.candidates
    .map(assessCandidate)
    .sort((left, right) => left.number - right.number);

  const stateCounts = Object.fromEntries(
    STATE_ORDER.map((state) => [
      state,
      candidates.filter((candidate) => candidate.state === state).length,
    ]),
  ) as Record<V3PrIntegrationState, number>;

  return {
    schemaVersion: 1,
    repository: snapshot.repository,
    mainSha: snapshot.mainSha.toLowerCase(),
    candidateCount: candidates.length,
    stateCounts,
    candidates,
    certificationClaim: false,
    mergeAuthorizationClaim: false,
    productionTrafficGenerated: false,
  };
}

export function formatV3PrIntegrationReportMarkdown(report: V3PrIntegrationReport) {
  const lines = [
    "# V3 Current-PR Integration State",
    "",
    `- Repository: \`${report.repository}\``,
    `- Current main: \`${report.mainSha}\``,
    `- PR candidates: ${report.candidateCount}`,
    "- Certification claim: false",
    "- Merge-authorization claim: false",
    "- Production traffic generated: false",
    "",
    "| PR | State | Base | Behind main | Exact-head checks | Blocker |",
    "|---:|---|---|---:|---|---|",
  ];

  for (const candidate of report.candidates) {
    const checks = candidate.requiredChecks.length
      ? `${candidate.exactHeadChecksPassed.length}/${candidate.requiredChecks.length}`
      : "0/0";
    const blocker = candidate.blockers.length
      ? candidate.blockers.join("<br>").replace(/\|/g, "\\|")
      : "-";
    lines.push(
      `| #${candidate.number} | **${candidate.state}** | \`${candidate.baseRef}\` | ${candidate.behindMainBy ?? "?"} | ${checks} | ${blocker} |`,
    );
  }

  lines.push(
    "",
    "> `exact_head_verified` means only that the supplied required checks are successful for that exact PR head and current-main drift is zero. It is not permission to merge and it is not S16 release certification.",
  );

  return `${lines.join("\n")}\n`;
}

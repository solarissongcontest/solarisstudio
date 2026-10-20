import type { PublicUxMetrics, PublicWebVitalRouteMetric } from "./public-ux-metrics";

export type PublicUxFindingTone = "blocked" | "attention" | "info";

export type PublicUxFinding = {
  id: string;
  tone: PublicUxFindingTone;
  title: string;
  evidence: string;
  action: string;
  priority: number;
};

export const PUBLIC_UX_SERVER_GAPS = [
  "Route backtracking",
  "Dead ends",
  "Workflow abandonment",
  "Error classes",
] as const;

export function publicUxServerGaps(metrics: PublicUxMetrics) {
  return metrics.diagnostics ? [] : [...PUBLIC_UX_SERVER_GAPS];
}

function ratio(count: number, total: number) {
  if (!Number.isFinite(count) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, count / total);
}

function percentage(value: number) {
  return `${Math.round(value * 100)}%`;
}

function vitalSeverity(row: PublicWebVitalRouteMetric) {
  if (row.metric === "LCP") return row.p75 > 4000 ? 2 : row.p75 > 2500 ? 1 : 0;
  if (row.metric === "INP") return row.p75 > 500 ? 2 : row.p75 > 200 ? 1 : 0;
  return row.p75 > 0.25 ? 2 : row.p75 > 0.1 ? 1 : 0;
}

function formatVital(row: PublicWebVitalRouteMetric) {
  if (row.metric === "LCP") return `${(row.p75 / 1000).toFixed(2)} s`;
  if (row.metric === "INP") return `${Math.round(row.p75)} ms`;
  return row.p75.toFixed(3);
}

export function buildPublicUxFindings(
  metrics: PublicUxMetrics,
  vitalRows: readonly PublicWebVitalRouteMetric[] = [],
): PublicUxFinding[] {
  const findings: PublicUxFinding[] = [];
  const sessions = metrics.totals.sessions;

  if (metrics.search.submitted >= 5) {
    const noResultRate = ratio(metrics.search.noResults, metrics.search.submitted);
    if (noResultRate >= 0.2) {
      findings.push({
        id: "search-no-results",
        tone: noResultRate >= 0.35 ? "blocked" : "attention",
        title: "Search findability needs review",
        evidence: `${metrics.search.noResults} of ${metrics.search.submitted} measured searches returned no results (${percentage(noResultRate)}).`,
        action:
          "Review labels, synonyms and result coverage with the Beta study evidence. Raw search text stays unavailable by design.",
        priority: noResultRate >= 0.35 ? 95 : 80,
      });
    }
  }

  const lowCompletionTasks = metrics.tasks
    .filter((task) => task.started >= 3 && task.completionRate < 70)
    .sort((a, b) => a.completionRate - b.completionRate || b.started - a.started);
  for (const task of lowCompletionTasks.slice(0, 3)) {
    findings.push({
      id: `task-${task.target}`,
      tone: task.completionRate < 50 ? "blocked" : "attention",
      title: `${task.target} completion is low`,
      evidence: `${task.completed} of ${task.started} measured starts completed (${Math.round(task.completionRate)}%).`,
      action:
        "Re-run this exact workflow on phone and desktop, then fix the earliest reproducible blocker before optimizing secondary steps.",
      priority: task.completionRate < 50 ? 92 : 78,
    });
  }

  if (sessions >= 5) {
    const highStepRate = ratio(metrics.friction.highStepSessions, sessions);
    if (highStepRate >= 0.15) {
      findings.push({
        id: "high-step-sessions",
        tone: highStepRate >= 0.3 ? "blocked" : "attention",
        title: "Journeys are taking too many navigation steps",
        evidence: `${metrics.friction.highStepSessions} of ${sessions} measured sessions reached the high-step threshold (${percentage(highStepRate)}).`,
        action:
          "Inspect the most-used destinations and first-click paths, then shorten the highest-volume journey before adding more navigation choices.",
        priority: highStepRate >= 0.3 ? 88 : 72,
      });
    }

    const repeatedSectionRate = ratio(metrics.friction.repeatedSectionSessions, sessions);
    if (repeatedSectionRate >= 0.1) {
      findings.push({
        id: "repeated-section-switching",
        tone: repeatedSectionRate >= 0.25 ? "blocked" : "attention",
        title: "Visitors are switching global areas repeatedly",
        evidence: `${metrics.friction.repeatedSectionSessions} of ${sessions} measured sessions crossed the repeated-section threshold (${percentage(repeatedSectionRate)}).`,
        action:
          "Review information scent and destination ownership for the affected public areas; repeated switching is a review signal, not proof of failure.",
        priority: repeatedSectionRate >= 0.25 ? 84 : 68,
      });
    }
  }

  const diagnostics = metrics.diagnostics;
  if (diagnostics && sessions >= 5) {
    const backtrackRate = ratio(diagnostics.routeBacktracking.sessions, sessions);
    if (backtrackRate >= 0.12) {
      findings.push({
        id: "route-backtracking",
        tone: backtrackRate >= 0.3 ? "blocked" : "attention",
        title: "Visitors are returning to destinations they already left",
        evidence: `${diagnostics.routeBacktracking.sessions} of ${sessions} measured sessions contained a route backtrack (${percentage(backtrackRate)}).`,
        action:
          "Start with the highest-volume backtracked destinations and check whether labels, back behavior or information scent are sending people down the wrong branch.",
        priority: backtrackRate >= 0.3 ? 90 : 74,
      });
    }

    const deadEndRate = ratio(diagnostics.deadEnds.sessions, sessions);
    if (deadEndRate >= 0.05) {
      findings.push({
        id: "dead-end-sessions",
        tone: deadEndRate >= 0.15 ? "blocked" : "attention",
        title: "Some measured journeys end on friction",
        evidence: `${diagnostics.deadEnds.sessions} of ${sessions} measured sessions ended on a no-result search or classified public error (${percentage(deadEndRate)}).`,
        action:
          "Inspect the top dead-end routes and make the recovery path explicit. Treat the aggregate as a review queue, not a replay of individual visitors.",
        priority: deadEndRate >= 0.15 ? 93 : 79,
      });
    }

    const abandonedTasks = diagnostics.workflowAbandonment.tasks
      .filter((task) => task.eligibleStarts >= 3 && task.abandonmentRate >= 25)
      .sort((a, b) => b.abandonmentRate - a.abandonmentRate || b.eligibleStarts - a.eligibleStarts);
    for (const task of abandonedTasks.slice(0, 3)) {
      findings.push({
        id: `abandonment-${task.target}`,
        tone: task.abandonmentRate >= 50 ? "blocked" : "attention",
        title: `${task.target} has measured abandonment`,
        evidence: `${task.abandoned} of ${task.eligibleStarts} eligible task runs did not complete within ${diagnostics.workflowAbandonment.windowMinutes} minutes (${Math.round(task.abandonmentRate)}%).`,
        action:
          "Rehearse this workflow from its canonical entry point and check auth, stale-state recovery, validation and completion acknowledgement before changing visual polish.",
        priority: task.abandonmentRate >= 50 ? 94 : 82,
      });
    }

    const errorRate = ratio(diagnostics.errors.total, sessions);
    if (diagnostics.errors.total >= 3 && errorRate >= 0.05) {
      const topClass = diagnostics.errors.classes[0];
      findings.push({
        id: "public-error-rate",
        tone: errorRate >= 0.2 ? "blocked" : "attention",
        title: "Public error states deserve review",
        evidence: `${diagnostics.errors.total} classified public errors were shown across ${sessions} measured sessions${topClass ? `; the most common class was ${topClass.errorClass} (${topClass.count})` : ""}.`,
        action:
          "Review the highest-volume safe error class and route combination. Error messages, stacks and user payloads are intentionally not available in this UX dataset.",
        priority: errorRate >= 0.2 ? 91 : 77,
      });
    }
  }

  const poorVitals = vitalRows
    .filter((row) => row.samples >= 3 && vitalSeverity(row) > 0)
    .sort((a, b) => vitalSeverity(b) - vitalSeverity(a) || b.samples - a.samples);
  for (const row of poorVitals.slice(0, 3)) {
    const severity = vitalSeverity(row);
    findings.push({
      id: `vital-${row.pathname}-${row.metric}-${row.device}`,
      tone: severity === 2 ? "blocked" : "attention",
      title: `${row.metric} needs work on ${row.pathname}`,
      evidence: `${row.device} p75 is ${formatVital(row)} across ${row.samples} samples.`,
      action: `Profile this route on ${row.device} and fix the dominant ${row.metric} contributor before broad visual polishing.`,
      priority: severity === 2 ? 90 : 70,
    });
  }

  if (!findings.length && metrics.totals.events > 0) {
    findings.push({
      id: "no-current-action",
      tone: "info",
      title: "No current aggregate crosses the action thresholds",
      evidence: metrics.diagnostics
        ? "The complete bounded aggregate projection is below the review thresholds for this window."
        : "The available aggregate signals are below the review thresholds for this window, but the server is still on the older diagnostics projection.",
      action: metrics.diagnostics
        ? "Keep monitoring and use Product QA studies for qualitative evidence."
        : "Keep monitoring, but do not interpret unavailable backtracking, dead-end, abandonment or error-class signals as zero friction.",
      priority: 10,
    });
  }

  return findings.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

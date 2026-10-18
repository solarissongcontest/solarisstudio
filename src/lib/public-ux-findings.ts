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
        action: "Review labels, synonyms and result coverage with the Beta study evidence. Raw search text stays unavailable by design.",
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
      action: "Re-run this exact workflow on phone and desktop, then fix the earliest reproducible blocker before optimizing secondary steps.",
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
        action: "Inspect the most-used destinations and first-click paths, then shorten the highest-volume journey before adding more navigation choices.",
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
        action: "Review information scent and destination ownership for the affected public areas; repeated switching is a review signal, not proof of failure.",
        priority: repeatedSectionRate >= 0.25 ? 84 : 68,
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
      evidence: "The available aggregate signals are below the review thresholds for this window.",
      action: "Keep monitoring and use Product QA studies for qualitative evidence. Do not interpret missing server signals as zero friction.",
      priority: 10,
    });
  }

  return findings.sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title));
}

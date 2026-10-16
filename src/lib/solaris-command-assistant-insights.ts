import type {
  V3OrganizerDomainKey,
  V3OrganizerProjection,
} from "@/lib/v3-organizer-projection";

export type SolarisCommandAssistantInsight = {
  domain: V3OrganizerDomainKey | "overview";
  title: string;
  summary: string;
  blockerCount: number;
  nextAction: { label: string; route: string } | null;
  readinessRoute: string | null;
};

const DOMAIN_PATTERNS: Array<[V3OrganizerDomainKey, RegExp]> = [
  ["results", /\b(result|results|publish|publication|winner|score)\b/i],
  ["voting", /\b(vote|voting|jury|televote|ballot)\b/i],
  ["delegations", /\b(delegation|country|confirmation|participation|hod)\b/i],
  ["contest", /\b(entry|entries|song|artist|media|show|running order|progression|eligibility)\b/i],
  ["communications", /\b(communication|notice|announcement|message|delivery)\b/i],
  ["production", /\b(production|broadcast|rundown|reveal|scoreboard|visual)\b/i],
  ["governance", /\b(governance|integrity|rule|ruling|appeal|evidence|investigation)\b/i],
  ["system", /\b(system|health|job|queue|sync|permission|access)\b/i],
];

export function inferCommandAssistantDomain(prompt: string): V3OrganizerDomainKey | null {
  const normalized = prompt.trim();
  if (!normalized) return null;
  return DOMAIN_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

export function buildCommandAssistantInsight(
  prompt: string,
  projection: V3OrganizerProjection,
): SolarisCommandAssistantInsight {
  const domain = inferCommandAssistantDomain(prompt);

  if (domain) {
    const summary = projection.domains[domain];
    const readinessFactor = [...projection.readiness.blocking, ...projection.readiness.incomplete]
      .find((factor) => factor.route === summary.primaryRoute || factor.route === summary.recommendedAction?.route);
    return {
      domain,
      title: `${summary.label}: ${summary.state.replaceAll("_", " ")}`,
      summary: summary.blockingIssueCount
        ? `${summary.detail}. ${summary.blockingIssueCount} critical ${summary.blockingIssueCount === 1 ? "blocker requires" : "blockers require"} intervention.`
        : summary.detail,
      blockerCount: summary.blockingIssueCount,
      nextAction: summary.recommendedAction ?? { label: `Open ${summary.label}`, route: summary.primaryRoute },
      readinessRoute: readinessFactor?.route ?? null,
    };
  }

  const topBlocker = projection.readiness.blocking[0] ?? projection.readiness.incomplete[0] ?? null;
  const topTask = projection.tasks.top[0] ?? null;
  return {
    domain: "overview",
    title: projection.readiness.blocking.length ? "Edition has blocking work" : "Edition operational summary",
    summary: topBlocker
      ? `${topBlocker.label}: ${topBlocker.detail}`
      : `${projection.readiness.overall}% readiness. ${projection.attention.length} attention ${projection.attention.length === 1 ? "item" : "items"} currently projected.`,
    blockerCount: projection.readiness.blocking.length,
    nextAction: topTask ? { label: topTask.title, route: topTask.href } : topBlocker ? { label: topBlocker.label, route: topBlocker.route } : null,
    readinessRoute: topBlocker?.route ?? null,
  };
}

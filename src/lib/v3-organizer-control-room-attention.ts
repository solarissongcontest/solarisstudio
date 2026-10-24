import type { EditionReadiness } from "@/lib/admin-readiness";
import type { Studio2IncidentRecord } from "@/lib/studio2-persistence";

export type ControlRoomAttentionSeverity = "critical" | "action" | "warning";

export type ControlRoomAttentionItem = {
  id: string;
  kind: "incident" | "readiness";
  severity: ControlRoomAttentionSeverity;
  title: string;
  detail: string;
  route: string;
  actionLabel: string;
};

function severityRank(severity: ControlRoomAttentionSeverity) {
  if (severity === "critical") return 0;
  if (severity === "action") return 1;
  return 2;
}

function incidentSeverity(incident: Studio2IncidentRecord): ControlRoomAttentionSeverity {
  if (incident.severity === "sev1") return "critical";
  if (incident.severity === "sev2") return "action";
  return "warning";
}

export function buildControlRoomAttention(
  readiness: EditionReadiness | null,
  incidents: Studio2IncidentRecord[],
): ControlRoomAttentionItem[] {
  const incidentItems = incidents
    .filter((incident) => incident.status !== "resolved")
    .map<ControlRoomAttentionItem>((incident) => ({
      id: `incident:${incident.id}`,
      kind: "incident",
      severity: incidentSeverity(incident),
      title: incident.title,
      detail: `${incident.severity.toUpperCase()} · ${incident.status.replaceAll("_", " ")}`,
      route: `/admin/incidents?incident=${encodeURIComponent(incident.id)}`,
      actionLabel: "Open incident",
    }));

  const readinessItems = (readiness?.issues ?? [])
    .filter((issue) => issue.severity === "critical" || issue.severity === "action")
    .map<ControlRoomAttentionItem>((issue) => ({
      id: `readiness:${issue.id}`,
      kind: "readiness",
      severity: issue.severity === "critical" ? "critical" : "action",
      title: issue.title,
      detail: issue.detail,
      route: "/admin/control",
      actionLabel: "Open Control",
    }));

  return [...incidentItems, ...readinessItems].sort((left, right) => {
    const severity = severityRank(left.severity) - severityRank(right.severity);
    if (severity) return severity;
    if (left.kind !== right.kind) return left.kind === "incident" ? -1 : 1;
    return left.title.localeCompare(right.title);
  });
}

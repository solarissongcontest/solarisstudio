import type { ControlRoomModel } from "@/lib/control-room-model";
import type { OrganizerTaskV5 } from "@/lib/admin-tasks-v5";

export type V3OrganizerRisk = "normal" | "elevated" | "critical";

export type V3OrganizerEditionProjection = {
  id: string;
  slug: string;
  name: string;
  editionNumber: number | null;
  status: string | null;
};

export type V3OrganizerTaskProjection = {
  total: number;
  critical: number;
  high: number;
  waiting: number;
  mine: number;
  top: OrganizerTaskV5[];
};

export type V3OrganizerProjection = {
  edition: V3OrganizerEditionProjection;
  tasks: V3OrganizerTaskProjection;
  live: ControlRoomModel;
  risk: V3OrganizerRisk;
};

const priorityRank: Record<OrganizerTaskV5["priority"], number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

function dueTime(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function buildV3OrganizerProjection(input: {
  edition: V3OrganizerEditionProjection;
  tasks: OrganizerTaskV5[];
  live: ControlRoomModel;
  actorId: string;
}): V3OrganizerProjection {
  const unresolved = input.tasks.filter((task) => task.state !== "resolved");
  const critical = unresolved.filter((task) => task.priority === "critical").length;
  const high = unresolved.filter((task) => task.priority === "high").length;
  const waiting = unresolved.filter((task) => task.state === "waiting").length;
  const mine = unresolved.filter((task) => task.assignedTo === input.actorId).length;
  const top = [...unresolved]
    .sort((a, b) => {
      const priority = priorityRank[a.priority] - priorityRank[b.priority];
      if (priority) return priority;
      const due = dueTime(a.dueAt) - dueTime(b.dueAt);
      if (due) return due;
      return a.openedAt.localeCompare(b.openedAt);
    })
    .slice(0, 5);

  const risk: V3OrganizerRisk =
    input.live.overallHealth === "critical" || critical > 0
      ? "critical"
      : input.live.overallHealth === "attention" || high > 0 || waiting > 0
        ? "elevated"
        : "normal";

  return {
    edition: input.edition,
    tasks: {
      total: unresolved.length,
      critical,
      high,
      waiting,
      mine,
      top,
    },
    live: input.live,
    risk,
  };
}

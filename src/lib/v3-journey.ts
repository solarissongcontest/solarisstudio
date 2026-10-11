import {
  sortSolarisTasks,
  type SolarisTask,
  type SolarisTaskKind,
} from "./participation-os";

export type V3JourneyResponsibility = "confirmation" | "entry" | "media" | "jury";
export type V3JourneyState = "complete" | "active" | "waiting" | "problem";

export type V3JourneyStepProjection = {
  id: string;
  responsibility: V3JourneyResponsibility;
  title: string;
  detail: string;
  state: V3JourneyState;
  route: string;
  actionRequired: boolean;
  deadline: string | null;
};

const RESPONSIBILITY_ORDER: readonly V3JourneyResponsibility[] = [
  "confirmation",
  "entry",
  "media",
  "jury",
];

function isResponsibility(kind: SolarisTaskKind): kind is V3JourneyResponsibility {
  return RESPONSIBILITY_ORDER.includes(kind as V3JourneyResponsibility);
}

function journeyState(task: SolarisTask): V3JourneyState {
  if (task.state === "completed" || task.state === "finished") return "complete";
  if (task.state === "problem") return "problem";
  if (task.state === "needs_attention" || task.state === "available") return "active";
  return "waiting";
}

/**
 * Build the V3 responsibility journey only from task evidence Solaris already
 * owns. Missing task kinds stay missing instead of being invented as locked or
 * incomplete steps. That keeps Journey a projection, never a second workflow
 * state machine.
 */
export function projectV3Journey(tasks: readonly SolarisTask[]): V3JourneyStepProjection[] {
  const firstByResponsibility = new Map<V3JourneyResponsibility, SolarisTask>();

  for (const task of sortSolarisTasks(tasks)) {
    if (!isResponsibility(task.kind)) continue;
    if (!firstByResponsibility.has(task.kind)) {
      firstByResponsibility.set(task.kind, task);
    }
  }

  return RESPONSIBILITY_ORDER.flatMap((responsibility) => {
    const task = firstByResponsibility.get(responsibility);
    if (!task) return [];

    return [
      {
        id: task.id,
        responsibility,
        title: task.title,
        detail: task.description,
        state: journeyState(task),
        route: task.route,
        actionRequired: task.actionRequired,
        deadline: task.deadline,
      } satisfies V3JourneyStepProjection,
    ];
  });
}

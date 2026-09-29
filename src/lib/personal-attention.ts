import type { MySolarisPriorityItem } from "./my-solaris-priorities";
import {
  buildParticipationTasks,
  taskNeedsAttention,
  type ParticipationOsInput,
  type SolarisTask,
} from "./participation-os";

export type PersonalAttentionInput = ParticipationOsInput;

function priorityKind(task: SolarisTask): MySolarisPriorityItem["kind"] {
  if (task.kind === "confirmation" || task.kind === "entry" || task.kind === "media") {
    return "entry";
  }
  if (task.kind === "jury" || task.kind === "televote") return "voting";
  if (task.kind === "notice") return "notice";
  if (task.kind === "deadline") return "deadline";
  if (task.kind === "info") return "info";
  return "task";
}

function prioritySeverity(task: SolarisTask): MySolarisPriorityItem["severity"] {
  if (task.state === "problem" || (task.importance === "required" && task.actionRequired)) {
    return "critical";
  }
  if (task.actionRequired) return "high";
  if (task.importance === "informational") return "info";
  return "medium";
}

export function priorityItemFromSolarisTask(task: SolarisTask): MySolarisPriorityItem {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    to: task.route,
    priority: task.priority,
    deadline: task.deadline,
    severity: prioritySeverity(task),
    actionRequired: task.actionRequired,
    kind: priorityKind(task),
  };
}

/**
 * Compatibility projection for Home and MySolaris surfaces.
 *
 * The Participation OS is the canonical resolver. This function deliberately
 * exposes only tasks that require attention so existing exception-driven
 * surfaces stay quiet when a delegation is complete or merely waiting.
 */
export function personalAttentionFromTasks(
  tasks: readonly SolarisTask[],
): MySolarisPriorityItem[] {
  return tasks.filter(taskNeedsAttention).map(priorityItemFromSolarisTask);
}

export function buildPersonalAttentionItems(
  input: PersonalAttentionInput,
): MySolarisPriorityItem[] {
  return personalAttentionFromTasks(buildParticipationTasks(input));
}

export function homepagePersonalAttention(
  items: readonly MySolarisPriorityItem[],
  limit = 3,
) {
  return items
    .filter(
      (item) =>
        item.actionRequired ||
        item.severity === "critical" ||
        item.severity === "high",
    )
    .slice(0, limit);
}

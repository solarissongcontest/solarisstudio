export const ORGANIZER_TASK_DOMAINS = [
  "delegations",
  "entries",
  "media",
  "voting",
  "integrity",
  "publication",
  "communications",
  "system",
] as const;

export type OrganizerTaskDomain = (typeof ORGANIZER_TASK_DOMAINS)[number];

export type OrganizerTaskDomainInput = {
  href: string;
  sourceKind: string;
  taskType: string;
};

/**
 * Classify an authoritative Organizer task into the canonical V3 operational
 * domain taxonomy. Semantic task identity wins over the route because a task
 * can be opened from a delegation/review workspace without changing ownership.
 */
export function organizerTaskDomain(task: OrganizerTaskDomainInput): OrganizerTaskDomain {
  const sourceKind = task.sourceKind.toLowerCase();
  const semantic = `${sourceKind} ${task.taskType}`.toLowerCase();

  // Communications ownership must win when the authoritative task source is a
  // notice/delivery source. Otherwise notice types such as rule_clarification
  // are accidentally swallowed by the generic Integrity "rule" matcher.
  if (/communication|notice|announcement|delivery|message|reminder/.test(sourceKind)) {
    return "communications";
  }

  if (/media|asset|artwork|photo|video|audio/.test(semantic)) return "media";
  if (/integrity|investigation|appeal|evidence|anti[-_ ]?abuse|fraud|ruling|rule/.test(semantic)) {
    return "integrity";
  }
  if (/jury|televote|voting|ballot|public.?vote/.test(semantic)) return "voting";
  if (/entry|submission|show|lineup|progress|eligib/.test(semantic)) return "entries";
  if (/result|publication|publish/.test(semantic)) return "publication";
  if (/communication|notice|announcement|delivery|message|reminder/.test(semantic)) {
    return "communications";
  }
  if (/confirm|delegat|participation/.test(semantic)) return "delegations";

  const route = task.href.toLowerCase();
  if (/media|asset|artwork|photo|video|audio/.test(route)) return "media";
  if (/integrity|investigation|appeal|evidence|anti[-_ ]?abuse|fraud|ruling|rule/.test(route)) {
    return "integrity";
  }
  if (/jury|televote|voting|ballot|public.?vote/.test(route)) return "voting";
  if (/entry|submission|show|lineup|progress|eligib/.test(route)) return "entries";
  if (/result|publication|publish/.test(route)) return "publication";
  if (/communication|notice|announcement|delivery|message|reminder/.test(route)) {
    return "communications";
  }
  if (/confirm|delegat|country|participation/.test(route)) return "delegations";
  return "system";
}

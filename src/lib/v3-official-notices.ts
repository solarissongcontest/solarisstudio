import type {
  NoticeAudience,
  NoticeInboxState,
  OperationalNotice,
} from "./official-communications";

export const V3_OFFICIAL_NOTICE_FILTER_STATES = [
  "unread",
  "read",
  "acknowledgement_required",
  "acknowledged",
  "archived",
] as const satisfies readonly NoticeInboxState[];

const V3_OFFICIAL_NOTICE_FILTER_SET = new Set<string>(
  V3_OFFICIAL_NOTICE_FILTER_STATES,
);

export function parseV3OfficialNoticeFilter(
  value: unknown,
): NoticeInboxState | undefined {
  return typeof value === "string" && V3_OFFICIAL_NOTICE_FILTER_SET.has(value)
    ? (value as NoticeInboxState)
    : undefined;
}

export function v3OfficialNoticeNeedsAction(
  notice: Pick<OperationalNotice, "acknowledgementRequired">,
  state: NoticeInboxState,
): boolean {
  if (!notice.acknowledgementRequired) return false;
  return state === "acknowledgement_required" || state === "unread";
}

export function v3OfficialNoticeResolved(state: NoticeInboxState): boolean {
  return state === "acknowledged" || state === "archived" || state === "read";
}

function assertNever(value: never): never {
  throw new Error(`Unsupported official-notice audience: ${String(value)}`);
}

function audienceReason(audience: NoticeAudience): string {
  switch (audience) {
    case "all_delegations":
      return "This notice was sent to all delegations.";
    case "participating_countries":
      return "This notice was sent to participating countries.";
    case "specific_countries":
      return "This notice was sent specifically to selected delegations, including yours.";
    case "jurors":
      return "This notice was sent to the official jury audience.";
    case "hods":
      return "This notice was sent to Heads of Delegation.";
    case "organizers":
      return "This notice was sent to the organizer audience.";
    case "edition_group":
      return "This notice was sent to an official edition recipient group.";
    case "staff":
      return "This notice was sent to the official staff audience.";
    case "press":
      return "This notice was sent to the official press audience.";
    default:
      return assertNever(audience);
  }
}

export function v3OfficialNoticeReason(
  notice: Pick<OperationalNotice, "audience" | "audienceGroup">,
): string {
  if (notice.audience === "edition_group" && notice.audienceGroup) {
    return `This notice was sent to the ${notice.audienceGroup.replace(/_/g, " ")} recipient group for this edition.`;
  }
  return audienceReason(notice.audience);
}

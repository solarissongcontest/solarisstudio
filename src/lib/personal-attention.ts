import type { CountryConfirmationResponse } from "./confirmation-country-account";
import type { PublicRound } from "./confirmation-rounds.functions";
import type { MySolarisPriorityItem } from "./my-solaris-priorities";
import { resolveScheduleState } from "./solaris-schedule";

export type PersonalAttentionInput = {
  editionId: string | null;
  responses: readonly CountryConfirmationResponse[];
  rounds: readonly PublicRound[];
  acknowledgementTasks?: number;
  now?: number;
};

function reviewStatus(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "accepted") return "accepted" as const;
  if (normalized === "declined" || normalized === "rejected") return "declined" as const;
  if (normalized === "removed") return "removed" as const;
  return "pending" as const;
}

function responseForRound(
  responses: readonly CountryConfirmationResponse[],
  roundId: string,
) {
  return responses.find((response) => response.round_id === roundId) ?? null;
}

function currentEditionResponses(
  responses: readonly CountryConfirmationResponse[],
  editionId: string,
) {
  return responses.filter((response) => response.edition_id === editionId);
}

function declinedNationalFinalEntries(response: CountryConfirmationResponse) {
  return (response.national_final?.entries ?? []).filter(
    (entry) => !entry.removed && reviewStatus(entry.review_status) === "declined",
  );
}

export function buildPersonalAttentionItems(
  input: PersonalAttentionInput,
): MySolarisPriorityItem[] {
  const now = input.now ?? Date.now();
  const items: MySolarisPriorityItem[] = [];
  const editionId = input.editionId;

  if (editionId) {
    const editionRounds = input.rounds.filter((round) => round.edition_id === editionId);
    const openRounds = editionRounds
      .filter(
        (round) =>
          resolveScheduleState(
            {
              status: round.status,
              opensAt: round.opens_at,
              closesAt: round.closes_at,
            },
            now,
          ) === "open",
      )
      .sort((a, b) => {
        const aClose = a.closes_at ? new Date(a.closes_at).getTime() : Number.POSITIVE_INFINITY;
        const bClose = b.closes_at ? new Date(b.closes_at).getTime() : Number.POSITIVE_INFINITY;
        return aClose - bClose;
      });

    for (const round of openRounds) {
      if (responseForRound(input.responses, round.id)) continue;
      items.push({
        id: `confirmation-missing:${round.id}`,
        title: "Submit your entry",
        description: round.closes_at
          ? `${round.name} is open and no submission has been received yet.`
          : `${round.name} is open and waiting for your submission.`,
        to: "/confirmations",
        priority: 120,
        deadline: round.closes_at,
        severity: "critical",
        actionRequired: true,
        kind: "entry",
      });
    }

    for (const response of currentEditionResponses(input.responses, editionId)) {
      if (response.selection_method === "internal" && response.internal_entry) {
        if (reviewStatus(response.internal_entry.review_status) === "declined") {
          items.push({
            id: `entry-declined:${response.submission_id}`,
            title: "Your entry needs changes",
            description:
              response.internal_entry.review_reason?.trim() ||
              "TSBC did not accept the current submitted entry.",
            to: "/confirmations",
            priority: 140,
            deadline: null,
            severity: "critical",
            actionRequired: response.can_edit,
            kind: "entry",
          });
        }
      }

      if (response.selection_method === "national_final") {
        const declined = declinedNationalFinalEntries(response);
        if (declined.length) {
          items.push({
            id: `nf-entry-declined:${response.submission_id}`,
            title: `${declined.length} National Final song${declined.length === 1 ? "" : "s"} need attention`,
            description:
              declined.length === 1
                ? declined[0]?.review_reason?.trim() ||
                  "TSBC did not accept one submitted National Final song."
                : "TSBC did not accept multiple submitted National Final songs.",
            to: "/confirmations",
            priority: 135,
            deadline: null,
            severity: "critical",
            actionRequired: response.can_edit,
            kind: "entry",
          });
        }
      }
    }
  }

  const acknowledgementTasks = input.acknowledgementTasks ?? 0;
  if (acknowledgementTasks > 0) {
    items.push({
      id: "required-notices",
      title: `${acknowledgementTasks} required acknowledgement${acknowledgementTasks === 1 ? "" : "s"}`,
      description: "Read the official notice and acknowledge it.",
      to: "/my-solaris/notices",
      priority: 130,
      deadline: null,
      severity: "critical",
      actionRequired: true,
      kind: "notice",
    });
  }

  return items.sort((a, b) => b.priority - a.priority);
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

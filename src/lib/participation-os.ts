import type { CountryConfirmationResponse } from "./confirmation-country-account";
import type { PublicRound } from "./confirmation-rounds.functions";
import { resolveScheduleState } from "./solaris-schedule";

export type SolarisTaskState =
  | "completed"
  | "available"
  | "needs_attention"
  | "upcoming"
  | "waiting"
  | "problem"
  | "finished";

export type SolarisTaskImportance =
  | "required"
  | "recommended"
  | "optional"
  | "informational";

export type SolarisTaskKind =
  | "confirmation"
  | "entry"
  | "media"
  | "jury"
  | "televote"
  | "notice"
  | "organizer-request"
  | "deadline"
  | "info";

export type SolarisTask = {
  id: string;
  editionId: string | null;
  kind: SolarisTaskKind;
  title: string;
  description: string;
  state: SolarisTaskState;
  importance: SolarisTaskImportance;
  blocking: boolean;
  actionRequired: boolean;
  opensAt: string | null;
  deadline: string | null;
  route: string;
  priority: number;
  why: string;
};

export type VotingTaskInput = {
  id: string;
  title: string;
  route: string;
  eligible: boolean;
  submitted: boolean;
  status?: string | null;
  opensAt?: string | null;
  closesAt?: string | null;
  required?: boolean;
};

export type ParticipationOsInput = {
  editionId: string | null;
  responses: readonly CountryConfirmationResponse[];
  rounds: readonly PublicRound[];
  acknowledgementTasks?: number;
  jury?: VotingTaskInput | null;
  televote?: VotingTaskInput | null;
  now?: number;
};

const STATE_ORDER: Record<SolarisTaskState, number> = {
  problem: 0,
  needs_attention: 1,
  available: 2,
  upcoming: 3,
  waiting: 4,
  completed: 5,
  finished: 6,
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

function deadlineTime(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

export function sortSolarisTasks(tasks: readonly SolarisTask[]) {
  return [...tasks].sort((a, b) => {
    const state = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    if (state) return state;
    if (a.priority !== b.priority) return b.priority - a.priority;
    const deadline = deadlineTime(a.deadline) - deadlineTime(b.deadline);
    if (deadline) return deadline;
    return a.title.localeCompare(b.title);
  });
}

function confirmationTask(
  editionId: string,
  round: PublicRound,
  response: CountryConfirmationResponse | null,
  now: number,
): SolarisTask {
  if (response) {
    return {
      id: `confirmation:${round.id}`,
      editionId,
      kind: "confirmation",
      title: round.name,
      description: "Your delegation confirmation has been received.",
      state: "completed",
      importance: required ? "required" : "optional",
      blocking: false,
      actionRequired: false,
      opensAt: round.opens_at,
      deadline: round.closes_at,
      route: "/confirmations",
      priority: 120,
      why: `Solaris has a recorded confirmation response for ${round.name}.`,
    };
  }

  const schedule = resolveScheduleState(
    {
      status: round.status,
      opensAt: round.opens_at,
      closesAt: round.closes_at,
    },
    now,
  );

  if (schedule === "closed") {
    return {
      id: `confirmation-missing:${round.id}`,
      editionId,
      kind: "confirmation",
      title: "Confirmation is missing",
      description: `${round.name} closed without a recorded response.`,
      state: "problem",
      importance: "required",
      blocking: true,
      actionRequired: true,
      opensAt: round.opens_at,
      deadline: round.closes_at,
      route: "/confirmations",
      priority: 145,
      why: `${round.name} is closed and Solaris has no confirmation response for this delegation.`,
    };
  }

  if (schedule === "open" || schedule === "closing-soon") {
    return {
      id: `confirmation-missing:${round.id}`,
      editionId,
      kind: "confirmation",
      title: "Submit your entry",
      description: round.closes_at
        ? `${round.name} is open and no submission has been received yet.`
        : `${round.name} is open and waiting for your submission.`,
      state: "needs_attention",
      importance: "required",
      blocking: true,
      actionRequired: true,
      opensAt: round.opens_at,
      deadline: round.closes_at,
      route: "/confirmations",
      priority: 120,
      why: `${round.name} is open and Solaris has no recorded response for this delegation.`,
    };
  }

  return {
    id: `confirmation-upcoming:${round.id}`,
    editionId,
    kind: "confirmation",
    title: round.name,
    description: round.opens_at
      ? "Confirmation is scheduled but not open yet."
      : "Confirmation is not open yet.",
    state: "upcoming",
    importance: "required",
    blocking: false,
    actionRequired: false,
    opensAt: round.opens_at,
    deadline: round.closes_at,
    route: "/confirmations",
    priority: 70,
    why: `${round.name} is scheduled for this edition but its participation window is not open.`,
  };
}

function votingTask(
  editionId: string | null,
  input: VotingTaskInput,
  now: number,
  kind: "jury" | "televote",
): SolarisTask | null {
  if (!input.eligible) return null;

  const required = input.required ?? true;

  if (input.submitted) {
    return {
      id: `${kind}:${input.id}`,
      editionId,
      kind,
      title: input.title,
      description: "Your submission has been received.",
      state: "completed",
      importance: "required",
      blocking: false,
      actionRequired: false,
      opensAt: input.opensAt ?? null,
      deadline: input.closesAt ?? null,
      route: input.route,
      priority: 110,
      why: "Solaris has a server-recorded submission for this voting task.",
    };
  }

  const schedule = resolveScheduleState(
    {
      status: input.status,
      opensAt: input.opensAt,
      closesAt: input.closesAt,
    },
    now,
  );

  const open = schedule === "open" || schedule === "closing-soon";
  const closed = schedule === "closed";

  return {
    id: `${kind}:${input.id}`,
    editionId,
    kind,
    title: input.title,
    description: closed
      ? required
        ? "The voting window closed without a recorded submission."
        : "This voting window has closed."
      : open
        ? required
          ? "Voting is open and no submission has been received yet."
          : "Voting is open now."
        : "Voting is scheduled but not open yet.",
    state: closed
      ? required
        ? "problem"
        : "finished"
      : open
        ? required
          ? "needs_attention"
          : "available"
        : "upcoming",
    importance: required ? "required" : "optional",
    blocking: required && (closed || open),
    actionRequired: required && (closed || open),
    opensAt: input.opensAt ?? null,
    deadline: input.closesAt ?? null,
    route: input.route,
    priority: required ? (closed ? 150 : open ? 125 : 75) : open ? 65 : 40,
    why: closed
      ? required
        ? "The official voting window is closed and Solaris has no recorded submission."
        : "This optional voting window has closed."
      : open
        ? required
          ? "The official voting window is open and Solaris has no recorded submission."
          : "This voting option is available now."
        : "The official voting window has not opened yet.",
  };
}

export function buildParticipationTasks(input: ParticipationOsInput): SolarisTask[] {
  const now = input.now ?? Date.now();
  const tasks: SolarisTask[] = [];
  const editionId = input.editionId;

  if (editionId) {
    const editionRounds = input.rounds.filter((round) => round.edition_id === editionId);
    for (const round of editionRounds) {
      tasks.push(
        confirmationTask(
          editionId,
          round,
          responseForRound(input.responses, round.id),
          now,
        ),
      );
    }

    for (const response of currentEditionResponses(input.responses, editionId)) {
      if (
        response.selection_method === "internal" &&
        response.internal_entry &&
        reviewStatus(response.internal_entry.review_status) === "declined"
      ) {
        tasks.push({
          id: `entry-declined:${response.submission_id}`,
          editionId,
          kind: "entry",
          title: "Your entry needs changes",
          description:
            response.internal_entry.review_reason?.trim() ||
            "TSBC did not accept the current submitted entry.",
          state: "problem",
          importance: "required",
          blocking: true,
          actionRequired: response.can_edit,
          opensAt: null,
          deadline: null,
          route: "/confirmations",
          priority: 140,
          why: "Organizer review marked the submitted entry as declined.",
        });
      }

      if (response.selection_method === "national_final") {
        const declined = declinedNationalFinalEntries(response);
        if (declined.length) {
          tasks.push({
            id: `nf-entry-declined:${response.submission_id}`,
            editionId,
            kind: "entry",
            title: `${declined.length} National Final song${declined.length === 1 ? "" : "s"} need attention`,
            description:
              declined.length === 1
                ? declined[0]?.review_reason?.trim() ||
                  "TSBC did not accept one submitted National Final song."
                : "TSBC did not accept multiple submitted National Final songs.",
            state: "problem",
            importance: "required",
            blocking: true,
            actionRequired: response.can_edit,
            opensAt: null,
            deadline: null,
            route: "/confirmations",
            priority: 135,
            why: "Organizer review declined one or more National Final entries.",
          });
        }
      }
    }
  }

  const acknowledgements = input.acknowledgementTasks ?? 0;
  if (acknowledgements > 0) {
    tasks.push({
      id: "required-notices",
      editionId,
      kind: "notice",
      title: `${acknowledgements} required acknowledgement${acknowledgements === 1 ? "" : "s"}`,
      description: "Read the official notice and acknowledge it.",
      state: "needs_attention",
      importance: "required",
      blocking: true,
      actionRequired: true,
      opensAt: null,
      deadline: null,
      route: "/my-solaris/notices",
      priority: 130,
      why: "One or more official notices explicitly require your acknowledgement.",
    });
  }

  const jury = input.jury ? votingTask(editionId, input.jury, now, "jury") : null;
  if (jury) tasks.push(jury);

  const televote = input.televote
    ? votingTask(editionId, input.televote, now, "televote")
    : null;
  if (televote) tasks.push(televote);

  return sortSolarisTasks(tasks);
}

export function taskNeedsAttention(task: SolarisTask) {
  return (
    task.actionRequired ||
    task.state === "problem" ||
    task.state === "needs_attention"
  );
}

export function participationTaskCounts(tasks: readonly SolarisTask[]) {
  return {
    needsAction: tasks.filter(taskNeedsAttention).length,
    upcoming: tasks.filter((task) => task.state === "upcoming").length,
    completed: tasks.filter(
      (task) => task.state === "completed" || task.state === "finished",
    ).length,
  };
}

export function homepageParticipationTasks(
  tasks: readonly SolarisTask[],
  limit = 3,
) {
  return sortSolarisTasks(tasks).filter(taskNeedsAttention).slice(0, limit);
}

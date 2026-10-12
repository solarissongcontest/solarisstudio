import type { V3BootstrapProjection } from "./v3-bootstrap";
import type { V3ActionProjection } from "./v3-experience";

export type V3ActionLinkSource =
  | "home"
  | "participate"
  | "notification"
  | "push"
  | "external";

export type V3ActionLinkRequest = {
  actionId: string;
  source: V3ActionLinkSource;
  editionId?: string | null;
};

export type V3ActionLinkResolution =
  | {
      status: "actionable";
      route: string;
      action: V3ActionProjection;
      message: null;
    }
  | {
      status: "completed";
      route: string;
      action: V3ActionProjection;
      message: string;
    }
  | {
      status: "upcoming";
      route: string;
      action: V3ActionProjection;
      message: string;
    }
  | {
      status: "waiting";
      route: string;
      action: V3ActionProjection;
      message: string;
    }
  | {
      status: "problem";
      route: string;
      action: V3ActionProjection;
      message: string;
    }
  | {
      status: "closed";
      route: string;
      action: V3ActionProjection;
      message: string;
    }
  | {
      status: "context-mismatch";
      route: "/participate";
      action: V3ActionProjection;
      targetEditionId: string;
      message: string;
    }
  | {
      status: "stale";
      route: "/participate";
      action: null;
      message: string;
    };

function messageForSource(source: V3ActionLinkSource, message: string) {
  if (source === "push" || source === "notification") return message;
  return message;
}

/**
 * Resolve an action deep link against the latest V3 bootstrap instead of
 * trusting the state that existed when a notification or page link was made.
 *
 * This is intentionally a pure resolver. It owns no workflow truth and performs
 * no network work. The caller must refresh/reconcile the canonical bootstrap
 * before using this function for time-sensitive external/push navigation.
 */
export function resolveV3ActionLink(
  bootstrap: Pick<V3BootstrapProjection, "actions" | "context">,
  request: V3ActionLinkRequest,
): V3ActionLinkResolution {
  const action = bootstrap.actions.find((candidate) => candidate.id === request.actionId) ?? null;

  if (!action) {
    return {
      status: "stale",
      route: "/participate",
      action: null,
      message: messageForSource(
        request.source,
        "This action is no longer active. Your current participation status is shown here.",
      ),
    };
  }

  const expectedEditionId = request.editionId ?? null;
  const actionEditionId = action.editionId ?? null;
  const currentEditionId = bootstrap.context.editionId ?? null;

  if (
    actionEditionId &&
    ((expectedEditionId && expectedEditionId !== actionEditionId) ||
      (!expectedEditionId && currentEditionId && currentEditionId !== actionEditionId))
  ) {
    return {
      status: "context-mismatch",
      route: "/participate",
      action,
      targetEditionId: actionEditionId,
      message: "This action belongs to a different Solaris edition. Switch context before continuing.",
    };
  }

  if (action.completed || action.sourceState === "completed") {
    return {
      status: "completed",
      route: action.route,
      action,
      message: "This action is already complete.",
    };
  }

  if (action.sourceState === "finished") {
    return {
      status: "closed",
      route: action.route,
      action,
      message: "This participation window has closed.",
    };
  }

  if (action.sourceState === "upcoming") {
    return {
      status: "upcoming",
      route: action.route,
      action,
      message: "This action is scheduled but is not open yet.",
    };
  }

  if (action.sourceState === "waiting") {
    return {
      status: "waiting",
      route: action.route,
      action,
      message: "This responsibility exists, but there is currently no available submission window.",
    };
  }

  if (action.sourceState === "problem") {
    return {
      status: "problem",
      route: action.route,
      action,
      message: action.actionRequired
        ? "This item needs attention. Open the current workflow for the latest status."
        : "This item has a problem, but there is no action available to you right now.",
    };
  }

  if (action.actionRequired || action.sourceState === "available") {
    return {
      status: "actionable",
      route: action.route,
      action,
      message: null,
    };
  }

  return {
    status: "waiting",
    route: action.route,
    action,
    message: "This item is current, but there is nothing you need to do right now.",
  };
}

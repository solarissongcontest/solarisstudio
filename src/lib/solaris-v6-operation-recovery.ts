import { classifyAppError, type AppErrorKind } from "@/lib/app-error-state";

export type SolarisV6OperationRecoveryAction =
  | "retry-same-operation"
  | "wait-and-retry-same-operation"
  | "refresh-canonical"
  | "reauthenticate"
  | "refresh-access"
  | "wait-for-service";

export type SolarisV6OperationRecovery = {
  kind: AppErrorKind;
  action: SolarisV6OperationRecoveryAction;
  title: string;
  description: string;
  outcomeUnknown: boolean;
  allowSameIdentityRetry: boolean;
  shouldRefreshCanonical: boolean;
  keepOperationOpen: boolean;
};

/**
 * Recovery policy for consequential commands.
 *
 * This does not decide whether a mutation succeeded. Canonical server state and
 * V5 operation receipts remain authoritative. It only tells UI code how to
 * recover without creating a second logical command or overwriting newer work.
 */
export function resolveSolarisV6OperationRecovery(
  error: unknown,
  {
    online = true,
    stableOperationIdentity,
  }: {
    online?: boolean;
    stableOperationIdentity: boolean;
  },
): SolarisV6OperationRecovery {
  const kind = classifyAppError(error, online);

  if (kind === "authentication-expired") {
    return {
      kind,
      action: "reauthenticate",
      title: "Your session expired",
      description:
        "The command was stopped. Sign in again and reload canonical state before attempting it again.",
      outcomeUnknown: false,
      allowSameIdentityRetry: false,
      shouldRefreshCanonical: false,
      keepOperationOpen: false,
    };
  }

  if (kind === "permission-denied") {
    return {
      kind,
      action: "refresh-access",
      title: "Your access changed",
      description:
        "Solaris will not retry this command. Reload current permissions and canonical state before continuing.",
      outcomeUnknown: false,
      allowSameIdentityRetry: false,
      shouldRefreshCanonical: true,
      keepOperationOpen: false,
    };
  }

  if (kind === "conflict") {
    return {
      kind,
      action: "refresh-canonical",
      title: "A newer version exists",
      description:
        "Your command used stale state, so Solaris rejected it instead of overwriting newer work. Canonical state must be refreshed first.",
      outcomeUnknown: false,
      allowSameIdentityRetry: false,
      shouldRefreshCanonical: true,
      keepOperationOpen: false,
    };
  }

  if (kind === "offline") {
    return {
      kind,
      action: stableOperationIdentity
        ? "wait-and-retry-same-operation"
        : "refresh-canonical",
      title: "Connection lost",
      description: stableOperationIdentity
        ? "Do not create a new command. Reconnect, then retry this exact operation identity so the server can replay an existing receipt if it already committed."
        : "Reconnect and reload canonical state before attempting this action again.",
      outcomeUnknown: stableOperationIdentity,
      allowSameIdentityRetry: stableOperationIdentity,
      shouldRefreshCanonical: !stableOperationIdentity,
      keepOperationOpen: stableOperationIdentity,
    };
  }

  if (kind === "service-unavailable") {
    return {
      kind,
      action: "wait-for-service",
      title: "The data service is unavailable",
      description:
        "Solaris will not issue another command while the service is restricted. Keep the operation context and retry only after service recovery.",
      outcomeUnknown: stableOperationIdentity,
      allowSameIdentityRetry: stableOperationIdentity,
      shouldRefreshCanonical: false,
      keepOperationOpen: stableOperationIdentity,
    };
  }

  if (kind === "request-failed" && stableOperationIdentity) {
    return {
      kind,
      action: "retry-same-operation",
      title: "The server response was lost",
      description:
        "The command outcome is not yet known. Retry with the same operation identity. If the server already committed it, the canonical receipt is replayed instead of executing it twice.",
      outcomeUnknown: true,
      allowSameIdentityRetry: true,
      shouldRefreshCanonical: false,
      keepOperationOpen: true,
    };
  }

  return {
    kind,
    action: "refresh-canonical",
    title: "Canonical state must be checked",
    description:
      "Solaris cannot safely infer the command outcome from this error. Refresh canonical state before creating another operation.",
    outcomeUnknown: stableOperationIdentity,
    allowSameIdentityRetry: false,
    shouldRefreshCanonical: true,
    keepOperationOpen: false,
  };
}

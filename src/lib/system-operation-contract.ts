export const SYSTEM_OPERATION_STATUSES = [
  "processing",
  "succeeded",
  "failed",
  "uncertain",
] as const;

export type SystemOperationStatus = (typeof SYSTEM_OPERATION_STATUSES)[number];

export const SYSTEM_ERROR_CODES = [
  "AUTHENTICATION",
  "AUTHORIZATION",
  "VALIDATION",
  "STATE_CHANGED",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMIT",
  "DEPENDENCY_FAILURE",
  "DATABASE",
  "STORAGE",
  "TIMEOUT",
  "UNKNOWN",
] as const;

export type SystemErrorCode = (typeof SYSTEM_ERROR_CODES)[number];

export type SystemErrorMetadataValue = string | number | boolean | null;

export type SystemJsonValue =
  | string
  | number
  | boolean
  | null
  | SystemJsonValue[]
  | { [key: string]: SystemJsonValue };

/** Safe, bounded failure information. Raw database errors never belong here. */
export type SystemError = {
  code: SystemErrorCode;
  message: string;
  retryable: boolean;
  metadata?: Readonly<Record<string, SystemErrorMetadataValue>>;
};

export type CorrelationContext = {
  requestId?: string | null;
  operationId: string;
  correlationId: string;
};

/**
 * Shared browser-to-server command vocabulary.
 *
 * Actor identity is intentionally absent. The authenticated server context is
 * authoritative; a browser-supplied actor identifier must never affect access.
 */
export type SystemCommand<TPayload> = {
  commandId: string;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
  expectedVersion?: number | string | null;
  editionId?: string | null;
  showId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  command: string;
  payload: TPayload;
  reason?: string | null;
  requestedAt: string;
};

export type SystemOperation = {
  /** Resolved from authenticated server context, never copied from the command. */
  actorId: string | null;
  commandId: string;
  operationId: string;
  idempotencyKey: string;
  correlationId: string;
  command: string;
  status: SystemOperationStatus;
  expectedVersion?: number | string | null;
  editionId?: string | null;
  showId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  requestedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  error?: SystemError | null;
};

export type SystemReceipt<TResult = SystemJsonValue> = {
  operationId: string;
  commandId: string;
  correlationId: string;
  command: string;
  status: SystemOperationStatus;
  replayed: boolean;
  result?: TResult | null;
  error?: SystemError | null;
  requestedAt: string;
  updatedAt: string;
  completedAt?: string | null;
};

export function createSystemCommand<TPayload>(input: {
  command: string;
  payload: TPayload;
  expectedVersion?: number | string | null;
  editionId?: string | null;
  showId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  reason?: string | null;
  commandId?: string;
  operationId?: string;
  idempotencyKey?: string;
  correlationId?: string;
  requestedAt?: string;
}): SystemCommand<TPayload> {
  const operationId = input.operationId ?? crypto.randomUUID();
  return {
    commandId: input.commandId ?? crypto.randomUUID(),
    operationId,
    idempotencyKey: input.idempotencyKey ?? operationId,
    correlationId: input.correlationId ?? operationId,
    expectedVersion: input.expectedVersion ?? null,
    editionId: input.editionId ?? null,
    showId: input.showId ?? null,
    subjectType: input.subjectType ?? null,
    subjectId: input.subjectId ?? null,
    command: input.command,
    payload: input.payload,
    reason: input.reason ?? null,
    requestedAt: input.requestedAt ?? new Date().toISOString(),
  };
}

export function correlationContext(
  command: Pick<SystemCommand<unknown>, "operationId" | "correlationId">,
  requestId?: string | null,
): CorrelationContext {
  return {
    requestId: requestId ?? null,
    operationId: command.operationId,
    correlationId: command.correlationId,
  };
}

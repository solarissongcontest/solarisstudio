import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchAccountSessionProjection,
  revokeAccountSessionRpc,
  revokeAccountSessionWithPasswordRpc,
} from "./account-session-management";

export type V3AccountFreshAuth = {
  fresh: boolean;
  method: string | null;
  authenticatedAt: string | null;
  ageSeconds: number | null;
  maxAgeSeconds: number | null;
};

export type V3AccountSession = {
  sessionHandle: string;
  current: boolean;
  createdAt: string | null;
  lastActiveAt: string | null;
  expiresAt: string | null;
  deviceLabel: string;
  browserLabel: string;
  aal: string | null;
  freshAuth: V3AccountFreshAuth | null;
};

export type V3AccountSecurityHistoryEvent = {
  type: "session_revoked";
  sessionHandle: string;
  occurredAt: string | null;
};

export type V3AccountSessionsProjection = {
  schemaReady: boolean;
  sessions: V3AccountSession[];
  securityHistory: V3AccountSecurityHistoryEvent[];
  serverTime: string | null;
};

export type V3SessionRevocationAttempt = {
  sessionHandle: string;
  operationId: string;
  idempotencyKey: string;
};

export type V3SessionRevocationResult = {
  ok: boolean;
  sessionHandle: string;
  operationId: string | null;
  receiptId: string | null;
  alreadyRevoked: boolean;
  replayed: boolean;
  revokedAt: string | null;
};

type ErrorLike = {
  code?: string;
  message?: string;
  hint?: string;
  details?: string;
};

const SESSION_QUERY_PREFIX = "v3-account-sessions";
const HANDLE_PATTERN = /^[0-9a-f]{64}$/;

function sessionQueryKey(viewerId: string) {
  return [SESSION_QUERY_PREFIX, viewerId] as const;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boolean(value: unknown): boolean {
  return value === true;
}

function parseFreshAuth(value: unknown): V3AccountFreshAuth | null {
  const row = record(value);
  if (!Object.keys(row).length) return null;
  return {
    fresh: boolean(row.fresh),
    method: text(row.method),
    authenticatedAt: text(row.authenticatedAt),
    ageSeconds: numberOrNull(row.ageSeconds),
    maxAgeSeconds: numberOrNull(row.maxAgeSeconds),
  };
}

function parseSession(value: unknown): V3AccountSession | null {
  const row = record(value);
  const sessionHandle = text(row.sessionHandle)?.toLowerCase() ?? "";
  if (!HANDLE_PATTERN.test(sessionHandle)) return null;

  const client = record(row.client);
  const assurance = record(row.assurance);
  return {
    sessionHandle,
    current: boolean(row.current),
    createdAt: text(row.createdAt),
    lastActiveAt: text(row.lastActiveAt),
    expiresAt: text(row.expiresAt),
    deviceLabel: text(client.device) ?? "Unknown device",
    browserLabel: text(client.browser) ?? "Other browser",
    aal: text(assurance.aal),
    freshAuth: parseFreshAuth(assurance.freshAuth),
  };
}

function parseHistoryEvent(value: unknown): V3AccountSecurityHistoryEvent | null {
  const row = record(value);
  const sessionHandle = text(row.sessionHandle)?.toLowerCase() ?? "";
  if (row.type !== "session_revoked" || !HANDLE_PATTERN.test(sessionHandle)) return null;
  return {
    type: "session_revoked",
    sessionHandle,
    occurredAt: text(row.occurredAt),
  };
}

export function parseV3AccountSessionsProjection(value: unknown): V3AccountSessionsProjection {
  const row = record(value);
  const rawSessions = Array.isArray(row.sessions) ? row.sessions : [];
  const sessions = rawSessions
    .map(parseSession)
    .filter((item): item is V3AccountSession => Boolean(item));
  const currentCount = sessions.filter((session) => session.current).length;

  if (rawSessions.length === 0 || sessions.length !== rawSessions.length || currentCount !== 1) {
    throw new Error("Solaris could not determine the authoritative current session.");
  }

  return {
    schemaReady: true,
    sessions,
    securityHistory: Array.isArray(row.securityHistory)
      ? row.securityHistory
          .map(parseHistoryEvent)
          .filter((item): item is V3AccountSecurityHistoryEvent => Boolean(item))
      : [],
    serverTime: text(row.serverTime),
  };
}

export function isV3AccountSessionContractUnavailable(error: unknown) {
  const candidate = (error ?? {}) as ErrorLike;
  const combined = `${candidate.message ?? ""} ${candidate.hint ?? ""} ${candidate.details ?? ""}`.toLowerCase();
  return (
    candidate.code === "PGRST202" ||
    candidate.code === "PGRST203" ||
    candidate.code === "42883" ||
    combined.includes("v3_my_sessions") ||
    combined.includes("v3_revoke_session") ||
    combined.includes("could not find the function")
  );
}

export function isV3AccountFreshAuthRequired(error: unknown) {
  const candidate = (error ?? {}) as ErrorLike;
  const combined = `${candidate.message ?? ""} ${candidate.hint ?? ""}`.toLowerCase();
  return (
    candidate.code === "42501" &&
    (combined.includes("fresh authentication") || combined.includes("re-enter your solaris account password"))
  );
}

export async function loadV3AccountSessions(): Promise<V3AccountSessionsProjection> {
  const { data, error } = await fetchAccountSessionProjection();
  if (error) {
    if (isV3AccountSessionContractUnavailable(error)) {
      return { schemaReady: false, sessions: [], securityHistory: [], serverTime: null };
    }
    throw error;
  }
  return parseV3AccountSessionsProjection(data);
}

export function createV3SessionRevocationAttempt(sessionHandle: string): V3SessionRevocationAttempt {
  const normalized = sessionHandle.toLowerCase();
  if (!HANDLE_PATTERN.test(normalized)) throw new Error("Invalid Solaris session handle.");
  const operationId = crypto.randomUUID();
  return {
    sessionHandle: normalized,
    operationId,
    idempotencyKey: `account-session-revoke:${operationId}`,
  };
}

function parseRevocationResult(
  value: unknown,
  attempt: V3SessionRevocationAttempt,
): V3SessionRevocationResult {
  const row = record(value);
  const returnedHandle = text(row.sessionHandle)?.toLowerCase() ?? attempt.sessionHandle;
  if (returnedHandle !== attempt.sessionHandle) {
    throw new Error("Solaris returned a session receipt for a different session.");
  }
  return {
    ok: row.ok !== false,
    sessionHandle: returnedHandle,
    operationId: text(row.operationId),
    receiptId: text(row.receiptId),
    alreadyRevoked: boolean(row.alreadyRevoked),
    replayed: boolean(row.replayed),
    revokedAt: text(row.revokedAt),
  };
}

export async function revokeV3AccountSession(
  attempt: V3SessionRevocationAttempt,
): Promise<V3SessionRevocationResult> {
  const { data, error } = await revokeAccountSessionRpc(attempt);
  if (error) throw error;
  return parseRevocationResult(data, attempt);
}

export async function revokeV3AccountSessionWithPassword(
  attempt: V3SessionRevocationAttempt,
  password: string,
): Promise<V3SessionRevocationResult> {
  const { data, error } = await revokeAccountSessionWithPasswordRpc(attempt, password);
  if (error) throw error;
  return parseRevocationResult(data, attempt);
}

export function useV3AccountSessions(viewerId: string | null | undefined, enabled = true) {
  const key = sessionQueryKey(viewerId ?? "signed-out");
  return useQuery({
    enabled: Boolean(enabled && viewerId),
    queryKey: key,
    queryFn: loadV3AccountSessions,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useRevokeV3AccountSession(viewerId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = sessionQueryKey(viewerId ?? "signed-out");
  return useMutation({
    mutationFn: revokeV3AccountSession,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

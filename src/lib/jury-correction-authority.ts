import { supabase } from "@/integrations/supabase/client";

export type JuryCorrectionAction = "assign" | "clear";

export type JuryCorrectionIdentity = {
  voterId: string | null;
  voterCountryId: string | null;
  voterEntityId: string | null;
};

export type JuryCorrectionPreview = {
  ok: true;
  editionId: string;
  showId: string;
  voterScopeKey: string;
  action: JuryCorrectionAction;
  points: number;
  receivingCountryId: string | null;
  receivingEntityId: string | null;
  stateVersion: number;
  voteCount: number;
  requiredVoteCount: number;
  projectedVoteCount: number;
  votes: Array<{
    id: string;
    points: number;
    receivingCountryId: string | null;
    receivingEntityId: string | null;
    ballotSubmissionId: string | null;
    createdAt: string;
  }>;
  didNotVote: Record<string, unknown> | null;
  submission: Record<string, unknown> | null;
  results: {
    rowCount: number;
    calculationVersion: number;
    reviewedVersion: number | null;
    lockedVersion: number | null;
    revealReadyVersion: number | null;
    publicationState: string;
    publicationVersion: number;
    public: boolean;
    scheduled: boolean;
    willRecalculate: boolean;
  };
  blockers: string[];
  canApply: boolean;
  serverTime: string;
};

export type JuryCorrectionReceipt = {
  ok: true;
  operationId: string;
  receiptId: string;
  command: "jury.correction.assign" | "jury.correction.clear";
  editionId: string;
  showId: string;
  voterScopeKey: string;
  action: JuryCorrectionAction;
  points: number;
  receivingCountryId: string | null;
  receivingEntityId: string | null;
  voteId?: string;
  clearedRows?: number;
  previousVersion: number;
  version: number;
  stateVersion: number;
  resultRecalculated: boolean;
  resultExecutionId?: string;
  resultCalculationVersion?: number;
  reason: string;
  before: JuryCorrectionPreview;
  after: JuryCorrectionPreview;
  serverTime: string;
  replayed: boolean;
};

type RpcError = { message?: string; code?: string };
type RpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

type Obj = Record<string, unknown>;

function object(value: unknown, label: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as Obj;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numberValue(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return parsed;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function optionalObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function rpcClient(): RpcClient {
  return supabase as unknown as RpcClient;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient().rpc(name, args);
  if (error) {
    const failure = new Error(error.message || `Solaris RPC failed: ${name}`);
    if (error.code) Object.assign(failure, { code: error.code });
    throw failure;
  }
  return data;
}

function parsePreview(value: unknown, expected: {
  editionId: string;
  showId: string;
  action: JuryCorrectionAction;
  points: number;
}): JuryCorrectionPreview {
  const row = object(value, "Jury correction preview");
  const editionId = text(row.editionId, "Jury correction edition");
  const showId = text(row.showId, "Jury correction show");
  const action = text(row.action, "Jury correction action");
  const points = numberValue(row.points, "Jury correction points");

  if (
    editionId !== expected.editionId
    || showId !== expected.showId
    || action !== expected.action
    || points !== expected.points
  ) {
    throw new Error("Solaris returned a Jury correction preview for a different operation.");
  }
  if (action !== "assign" && action !== "clear") {
    throw new Error("Solaris returned an unsupported Jury correction action.");
  }

  const resultState = object(row.results, "Jury correction result state");
  const rawVotes = Array.isArray(row.votes) ? row.votes : [];

  return {
    ok: true,
    editionId,
    showId,
    voterScopeKey: text(row.voterScopeKey, "Jury voter scope"),
    action,
    points,
    receivingCountryId: nullableText(row.receivingCountryId),
    receivingEntityId: nullableText(row.receivingEntityId),
    stateVersion: numberValue(row.stateVersion, "Jury ballot state version"),
    voteCount: numberValue(row.voteCount, "Jury vote count"),
    requiredVoteCount: numberValue(row.requiredVoteCount, "required Jury vote count"),
    projectedVoteCount: numberValue(row.projectedVoteCount, "projected Jury vote count"),
    votes: rawVotes.map((value) => {
      const vote = object(value, "Jury vote row");
      return {
        id: text(vote.id, "Jury vote id"),
        points: numberValue(vote.points, "Jury vote points"),
        receivingCountryId: nullableText(vote.receivingCountryId),
        receivingEntityId: nullableText(vote.receivingEntityId),
        ballotSubmissionId: nullableText(vote.ballotSubmissionId),
        createdAt: text(vote.createdAt, "Jury vote time"),
      };
    }),
    didNotVote: optionalObject(row.didNotVote),
    submission: optionalObject(row.submission),
    results: {
      rowCount: numberValue(resultState.rowCount, "result row count"),
      calculationVersion: numberValue(resultState.calculationVersion, "result calculation version"),
      reviewedVersion: nullableNumber(resultState.reviewedVersion),
      lockedVersion: nullableNumber(resultState.lockedVersion),
      revealReadyVersion: nullableNumber(resultState.revealReadyVersion),
      publicationState: text(resultState.publicationState, "result publication state"),
      publicationVersion: numberValue(resultState.publicationVersion, "publication version"),
      public: booleanValue(resultState.public, "public result state"),
      scheduled: booleanValue(resultState.scheduled, "scheduled result state"),
      willRecalculate: booleanValue(resultState.willRecalculate, "result recalculation state"),
    },
    blockers: stringArray(row.blockers),
    canApply: booleanValue(row.canApply, "Jury correction availability"),
    serverTime: text(row.serverTime, "Jury correction server time"),
  };
}

function parseReceipt(value: unknown, expected: {
  operationId: string;
  editionId: string;
  showId: string;
  action: JuryCorrectionAction;
  points: number;
}): JuryCorrectionReceipt {
  const row = object(value, "Jury correction receipt");
  const operationId = text(row.operationId, "Jury correction operation id");
  const receiptId = text(row.receiptId, "Jury correction receipt id");
  const editionId = text(row.editionId, "Jury correction receipt edition");
  const showId = text(row.showId, "Jury correction receipt show");
  const action = text(row.action, "Jury correction receipt action");
  const points = numberValue(row.points, "Jury correction receipt points");

  if (
    operationId !== expected.operationId
    || receiptId !== expected.operationId
    || editionId !== expected.editionId
    || showId !== expected.showId
    || action !== expected.action
    || points !== expected.points
  ) {
    throw new Error("Solaris returned a receipt for a different Jury correction.");
  }
  if (action !== "assign" && action !== "clear") {
    throw new Error("Solaris returned an unsupported Jury correction receipt.");
  }

  const expectedCommand = action === "assign"
    ? "jury.correction.assign"
    : "jury.correction.clear";
  if (text(row.command, "Jury correction command") !== expectedCommand) {
    throw new Error("Solaris returned a Jury correction receipt with the wrong command identity.");
  }

  return {
    ok: true,
    operationId,
    receiptId,
    command: expectedCommand,
    editionId,
    showId,
    voterScopeKey: text(row.voterScopeKey, "Jury correction voter scope"),
    action,
    points,
    receivingCountryId: nullableText(row.receivingCountryId),
    receivingEntityId: nullableText(row.receivingEntityId),
    voteId: nullableText(row.voteId) ?? undefined,
    clearedRows: nullableNumber(row.clearedRows) ?? undefined,
    previousVersion: numberValue(row.previousVersion, "previous Jury ballot version"),
    version: numberValue(row.version, "Jury ballot version"),
    stateVersion: numberValue(row.stateVersion, "Jury ballot state version"),
    resultRecalculated: booleanValue(row.resultRecalculated, "result recalculation receipt"),
    resultExecutionId: nullableText(row.resultExecutionId) ?? undefined,
    resultCalculationVersion: nullableNumber(row.resultCalculationVersion) ?? undefined,
    reason: text(row.reason, "Jury correction reason"),
    before: parsePreview(row.before, expected),
    after: parsePreview(row.after, expected),
    serverTime: text(row.serverTime, "Jury correction receipt server time"),
    replayed: row.replayed === true,
  };
}

function rpcArgs(input: {
  editionId: string;
  showId: string;
  identity: JuryCorrectionIdentity;
  action: JuryCorrectionAction;
  points: number;
  receivingCountryId?: string | null;
  receivingEntityId?: string | null;
}) {
  return {
    p_edition_id: input.editionId,
    p_show_id: input.showId,
    p_voter_id: input.identity.voterId,
    p_voter_country_id: input.identity.voterCountryId,
    p_voter_entity_id: input.identity.voterEntityId,
    p_action: input.action,
    p_points: input.points,
    p_receiving_country_id: input.receivingCountryId ?? null,
    p_receiving_entity_id: input.receivingEntityId ?? null,
  };
}

export async function previewJuryCorrection(input: {
  editionId: string;
  showId: string;
  identity: JuryCorrectionIdentity;
  action: JuryCorrectionAction;
  points: number;
  receivingCountryId?: string | null;
  receivingEntityId?: string | null;
}): Promise<JuryCorrectionPreview> {
  return parsePreview(
    await rpc("studio2_jury_correction_preview", rpcArgs(input)),
    input,
  );
}

async function reconcileJuryCorrection(
  operationId: string,
  expected: Omit<Parameters<typeof parseReceipt>[1], "operationId">,
): Promise<JuryCorrectionReceipt | null> {
  try {
    const reconciliation = object(
      await rpc("studio2_reconcile_operation", { p_operation_id: operationId }),
      "Jury correction reconciliation",
    );
    const command = expected.action === "assign"
      ? "jury.correction.assign"
      : "jury.correction.clear";
    if (
      reconciliation.operationId !== operationId
      || reconciliation.command !== command
      || reconciliation.status !== "succeeded"
    ) {
      return null;
    }
    return parseReceipt(
      { ...object(reconciliation.result, "Jury correction reconciled result"), replayed: true },
      { ...expected, operationId },
    );
  } catch {
    return null;
  }
}

export function createJuryCorrectionIdentity(): {
  operationId: string;
  idempotencyKey: string;
} {
  const operationId = crypto.randomUUID();
  return {
    operationId,
    idempotencyKey: `jury-correction:${operationId}`,
  };
}

export async function applyJuryCorrection(input: {
  editionId: string;
  showId: string;
  identity: JuryCorrectionIdentity;
  action: JuryCorrectionAction;
  points: number;
  receivingCountryId?: string | null;
  receivingEntityId?: string | null;
  expectedVersion: number;
  reason: string;
  operationId: string;
  idempotencyKey: string;
}): Promise<JuryCorrectionReceipt> {
  if (!input.operationId || !input.idempotencyKey.trim()) {
    throw new Error("Jury correction operation identity is required.");
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new Error("A valid Jury ballot state version is required.");
  }
  if (input.reason.trim().length < 5) {
    throw new Error("A correction reason of at least 5 characters is required.");
  }

  const expected = {
    operationId: input.operationId,
    editionId: input.editionId,
    showId: input.showId,
    action: input.action,
    points: input.points,
  };

  try {
    return parseReceipt(
      await rpc("studio2_apply_jury_correction", {
        ...rpcArgs(input),
        p_expected_version: input.expectedVersion,
        p_reason: input.reason.trim(),
        p_operation_id: input.operationId,
        p_idempotency_key: input.idempotencyKey,
      }),
      expected,
    );
  } catch (error) {
    const recovered = await reconcileJuryCorrection(input.operationId, expected);
    if (recovered) return recovered;
    throw error;
  }
}

export async function reauthenticateJuryCorrectionR3(password: string): Promise<void> {
  if (!password) {
    throw new Error("Enter your current Solaris password to authorize this Jury correction.");
  }

  const { data: current, error: currentError } = await supabase.auth.getUser();
  if (currentError) throw currentError;
  const user = current.user;
  if (!user?.id || !user.email) {
    throw new Error("This Organizer account cannot be reauthenticated with a password.");
  }

  const originalUserId = user.id;
  const { data: signedIn, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (error) throw error;
  if (!signedIn.user || signedIn.user.id !== originalUserId) {
    await supabase.auth.signOut();
    throw new Error("Fresh authentication returned a different Solaris account.");
  }
}

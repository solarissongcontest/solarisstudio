import {
  isDefiniteJuryRejection,
  type JuryBallotReviewRequest,
  type JuryVoteCommandRequest,
} from "./v3-jury-vote-command";

type Identity = "expectedVersion" | "operationId" | "idempotencyKey";
export type RetainedJuryCommand =
  | ({ kind: "score" } & JuryVoteCommandRequest)
  | ({ kind: "review" } & JuryBallotReviewRequest);
export type JuryCommandIntent =
  | Omit<{ kind: "score" } & JuryVoteCommandRequest, Identity>
  | Omit<{ kind: "review" } & JuryBallotReviewRequest, Identity>;
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const juryRetryKey = (actorId: string) => `v3:jury-command:${actorId}`;
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

function validate(command: RetainedJuryCommand) {
  if (
    !command ||
    !uuid(command.editionId) ||
    !uuid(command.showId) ||
    !uuid(command.operationId) ||
    !command.idempotencyKey ||
    !Number.isSafeInteger(command.expectedVersion) ||
    command.expectedVersion < 0
  )
    throw new Error("Saved jury operation is invalid. Do not replace an uncertain operation.");
  if (command.kind === "score") {
    if (
      !["assign", "clear"].includes(command.action) ||
      !Number.isSafeInteger(command.points) ||
      [
        command.voterId,
        command.voterCountryId,
        command.voterEntityId,
        command.receivingCountryId,
        command.receivingEntityId,
      ].some((value) => value !== null && !uuid(value))
    )
      throw new Error("Saved jury score request is invalid.");
  } else if (
    command.kind !== "review" ||
    !uuid(command.ballotId) ||
    !["valid", "needs_review", "invalidated", "superseded"].includes(command.targetStatus) ||
    (command.reason !== null && typeof command.reason !== "string")
  )
    throw new Error("Saved jury review request is invalid.");
  return command;
}
function intentOf(command: JuryCommandIntent | RetainedJuryCommand) {
  // Flat semantic DTOs: remove only retry identity/version, normalize the
  // reason, and sort keys so JSON property order cannot change retry matching.
  return JSON.stringify(
    Object.entries(command)
      .filter(([key]) => !["expectedVersion", "operationId", "idempotencyKey"].includes(key))
      .map(([key, value]) => [
        key,
        key === "reason" ? (typeof value === "string" ? value.trim() || null : null) : value,
      ])
      .sort(([a], [b]) => String(a).localeCompare(String(b))),
  );
}
export function readRetainedJuryCommand(
  actorId: string,
  storage: Store,
): RetainedJuryCommand | null {
  if (!actorId) throw new Error("A signed-in jury actor is required.");
  const saved = storage.getItem(juryRetryKey(actorId));
  return saved ? validate(JSON.parse(saved) as RetainedJuryCommand) : null;
}
export async function recoverRetainedJuryCommand(
  actorId: string,
  storage: Store,
  execute: (command: RetainedJuryCommand) => Promise<unknown>,
) {
  const command = readRetainedJuryCommand(actorId, storage);
  if (!command) return null;
  try {
    const result = await execute(command);
    storage.removeItem(juryRetryKey(actorId));
    return result;
  } catch (error) {
    if (isDefiniteJuryRejection(error)) storage.removeItem(juryRetryKey(actorId));
    throw error;
  }
}
/** Persistence happens before sending. A refresh, new preview or different click
 * must not silently replace an uncertain reviewed version or operation id. */
export async function runRetainedJuryCommand(
  actorId: string,
  intent: JuryCommandIntent,
  storage: Store,
  prepare: () => Promise<RetainedJuryCommand>,
  execute: (command: RetainedJuryCommand) => Promise<unknown>,
) {
  let command = readRetainedJuryCommand(actorId, storage);
  if (command && intentOf(command) !== intentOf(intent))
    throw new Error("Recover the previous jury change before reviewing another change.");
  if (!command) {
    command = validate(await prepare());
    if (intentOf(command) !== intentOf(intent))
      throw new Error("Prepared jury operation does not match the reviewed change.");
    storage.setItem(juryRetryKey(actorId), JSON.stringify(command));
  }
  return recoverRetainedJuryCommand(actorId, storage, execute);
}

export type RequirementChange = {
  kind: "reconfirm" | "waive";
  editionId: string;
  requirementId: string;
  reason: string;
  expectedRevision: string;
  operationId: string;
  idempotencyKey: string;
};
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const requirementRetryPrefix = (actorId: string) => `v3:confirmation-requirement:${actorId}:`;
export type RequirementSubmit = (change: RequirementChange) => PromiseLike<{data: unknown; error: {message: string; code?: string} | null}>;

/** Retain the exact reviewed request until its receipt is known. In particular,
 * a newly-created UI command after a lost response cannot replace this identity. */
export async function runRetainedRequirementChange(actorId: string, change: RequirementChange, storage: Store, submit: RequirementSubmit) {
  if (!/^[a-f0-9]{64}$/.test(change.expectedRevision ?? "")) throw new Error("Refresh this requirement before reviewing a change.");
  const key = requirementRetryPrefix(actorId) + change.requirementId;
  const saved = storage.getItem(key);
  const request: RequirementChange = saved ? JSON.parse(saved) : {...change, reason: change.reason.trim()};
  if (saved && (request.kind !== change.kind || request.requirementId !== change.requirementId || request.editionId !== change.editionId || request.reason !== change.reason.trim() || request.expectedRevision !== change.expectedRevision)) {
    throw new Error("A previous requirement change needs recovery. Refresh before reviewing another change.");
  }
  if (!saved) storage.setItem(key, JSON.stringify(request));
  const {data, error} = await submit(request);
  if (error) {
    if (error.code === "PT409" && error.message === "VERSION_CONFLICT") storage.removeItem(key);
    throw Object.assign(new Error(error.message), {code: error.code});
  }
  if (!data || typeof data !== "object" || !("ok" in data) || data.ok !== true || !("operationId" in data) || data.operationId !== request.operationId) {
    throw new Error("Requirement change is unconfirmed. Retry the retained operation.");
  }
  storage.removeItem(key);
  return data;
}

/**
 * Client envelope for the postgres-owned Integrity adjudication commands.
 * The database rechecks actor permission, aggregate version and operation
 * identity atomically; this helper never substitutes for those checks.
 *
 * Pass the observed version from the organizer's reviewed snapshot. Never
 * silently refetch a newer version merely to make a stale decision succeed.
 * Keep this envelope unchanged if an uncertain request is retried.
 */
export function governedIntegrityArgs(expectedVersion: unknown, operationId = crypto.randomUUID()) {
  if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    throw new Error("Integrity record revision is unavailable. Refresh before making changes.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw new Error("A valid Integrity operation identity is required.");
  }
  return {
    p_operation_id: operationId,
    p_idempotency_key: `integrity:${operationId}`,
    p_expected_version: expectedVersion,
  } as const;
}

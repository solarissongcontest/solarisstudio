import { describe, expect, it, vi } from "vitest";
import {
  reconcileConfirmationEditionToSolarisWithDependencies,
  verifyConfirmationEditionProjectionWithDatabase,
} from "@/integrations/confirmations/reconcile.server";

const editionId = "11111111-1111-4111-8111-111111111111";
const submissionId = "22222222-2222-4222-8222-222222222222";
const rows = [{ id: submissionId, edition_id: editionId, updated_at: "2026-11-01T12:00:00Z" }];

/** Fake data source deliberately has no network/production client. */
function dbWithReportedCount(count: unknown, submissions = rows) {
  return {
    from(table: string) {
      if (table === "editions") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: editionId }, error: null }),
            }),
          }),
        };
      }
      if (table === "submissions") {
        const query = {
          select: () => query,
          eq: () => query,
          order: () => query,
          range: async () => ({ data: submissions, count, error: null }),
        };
        return query;
      }
      throw new Error(`Unexpected table read: ${table}`);
    },
  };
}

describe("S6 Confirmation reconciliation exact-count safety", () => {
  it("never converts a missing repair count into an allegedly completed page", async () => {
    const syncSubmission = vi.fn(async () => ({ ok: true, status: "synced" }));
    await expect(
      reconcileConfirmationEditionToSolarisWithDependencies(
        editionId,
        { offset: 0, limit: 1 },
        { db: dbWithReportedCount(null), syncSubmission: syncSubmission as any },
      ),
    ).rejects.toThrow(/exact submission count is unavailable/);
    expect(syncSubmission).not.toHaveBeenCalled();
  });

  it("never declares read-only verification consistent without an exact count", async () => {
    await expect(
      verifyConfirmationEditionProjectionWithDatabase(editionId, dbWithReportedCount(null)),
    ).rejects.toThrow(/Confirmation verification: exact submission count is unavailable/);
  });

  it.each([undefined, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid submission cardinality %s without performing repairs",
    async (count) => {
      const syncSubmission = vi.fn(async () => ({ ok: true, status: "synced" }));
      await expect(
        reconcileConfirmationEditionToSolarisWithDependencies(
          editionId,
          { limit: 1 },
          { db: dbWithReportedCount(count), syncSubmission: syncSubmission as any },
        ),
      ).rejects.toThrow(/exact submission count is unavailable/);
      expect(syncSubmission).not.toHaveBeenCalled();
    },
  );

  it("fails closed when a reported count contradicts the returned page", async () => {
    const syncSubmission = vi.fn(async () => ({ ok: true, status: "synced" }));
    await expect(
      reconcileConfirmationEditionToSolarisWithDependencies(
        editionId,
        { limit: 1 },
        { db: dbWithReportedCount(0), syncSubmission: syncSubmission as any },
      ),
    ).rejects.toThrow(/inconsistent with the requested page/);
    expect(syncSubmission).not.toHaveBeenCalled();

    await expect(
      verifyConfirmationEditionProjectionWithDatabase(editionId, dbWithReportedCount(0)),
    ).rejects.toThrow(/inconsistent with the returned page/);
  });

  it("still repairs a count-proven, bounded page through the canonical sync dependency", async () => {
    const syncSubmission = vi.fn(async () => ({ ok: true, status: "synced" }));
    const outcome = await reconcileConfirmationEditionToSolarisWithDependencies(
      editionId,
      { offset: 0, limit: 1 },
      { db: dbWithReportedCount(1), syncSubmission: syncSubmission as any },
    );
    expect(outcome).toMatchObject({
      totalSubmissions: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      nextOffset: null,
      complete: true,
    });
    expect(syncSubmission).toHaveBeenCalledWith(submissionId);
  });
});

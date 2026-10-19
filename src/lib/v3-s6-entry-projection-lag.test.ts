import { describe, expect, it } from "vitest";
import {
  measureConfirmationEntryProjectionLagWithDependencies,
  V3_ENTRY_PROJECTION_LAG_MAX_ISSUES,
} from "@/integrations/confirmations/reconciliation-lag.server";
import type { ConfirmationProjectionVerificationResult } from "@/integrations/confirmations/reconcile.server";

class Query {
  constructor(private readonly rows: Array<{ id: string; updated_at: string | null }>) {}
  select() { return this; }
  in(_field: string, ids: readonly string[]) {
    const allowed = new Set(ids);
    return Promise.resolve({ data: this.rows.filter((row) => allowed.has(row.id)), error: null });
  }
}

class ReadOnlyDatabase {
  reads: string[] = [];
  constructor(private readonly tables: Record<string, Array<{ id: string; updated_at: string | null }>>) {}
  from(table: string) {
    this.reads.push(table);
    const rows = this.tables[table];
    if (!rows) throw new Error(`Unexpected table read: ${table}`);
    return new Query(rows);
  }
}

const editionId = "11111111-1111-4111-8111-111111111111";
const baseVerification = {
  editionId,
  reason: "verified",
  totalSubmissions: 1,
  latestCountrySubmissions: 1,
  canonicalOwnedOutsideConfirmations: 0,
  canonicalNewer: 0,
  verifiedAt: "2026-10-19T12:00:00.000Z",
} as const;

function verify(result: ConfirmationProjectionVerificationResult) {
  return async () => result;
}

describe("System V3 S6 Entry projection lag metric", () => {
  it("reports zero without extra database reads when independent verification is consistent", async () => {
    const db = new ReadOnlyDatabase({ submissions: [], entries: [] });
    const result = await measureConfirmationEntryProjectionLagWithDependencies(editionId, {
      db,
      verify: verify({ ...baseVerification, state: "consistent", issueCount: 0, issues: [] }),
      now: () => new Date("2026-10-19T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      state: "consistent",
      reason: "verified",
      issueCount: 0,
      oldestDriftAgeSeconds: 0,
    });
    expect(db.reads).toEqual([]);
  });

  it("preserves verifier unknown as an unmeasurable lag instead of reporting a healthy zero", async () => {
    const db = new ReadOnlyDatabase({ submissions: [], entries: [] });
    const result = await measureConfirmationEntryProjectionLagWithDependencies(editionId, {
      db,
      verify: verify({
        ...baseVerification,
        state: "unknown",
        reason: "verification_bound_exceeded",
        issueCount: 0,
        issues: [],
      }),
      now: () => new Date("2026-10-19T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      state: "unknown",
      reason: "verification_unknown",
      oldestDriftAgeSeconds: null,
    });
    expect(db.reads).toEqual([]);
  });

  it("measures oldest drift age only from bounded source rows named by verifier issues", async () => {
    const submissionId = "22222222-2222-4222-8222-222222222222";
    const orphanEntryId = "33333333-3333-4333-8333-333333333333";
    const db = new ReadOnlyDatabase({
      submissions: [{ id: submissionId, updated_at: "2026-10-19T10:00:00.000Z" }],
      entries: [{ id: orphanEntryId, updated_at: "2026-10-19T11:30:00.000Z" }],
    });
    const result = await measureConfirmationEntryProjectionLagWithDependencies(editionId, {
      db,
      verify: verify({
        ...baseVerification,
        state: "drift",
        issueCount: 2,
        issues: [
          { code: "entry_artist", submissionId, entryId: "44444444-4444-4444-8444-444444444444" },
          { code: "orphan_confirmation_entry", entryId: orphanEntryId },
        ],
      }),
      now: () => new Date("2026-10-19T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      state: "drift",
      reason: "verified",
      issueCount: 2,
      oldestDriftAgeSeconds: 7200,
    });
    expect(db.reads).toEqual(["submissions", "entries"]);
  });

  it("returns null honestly when drift exists but the implicated source timestamps are unavailable", async () => {
    const db = new ReadOnlyDatabase({ submissions: [], entries: [] });
    const result = await measureConfirmationEntryProjectionLagWithDependencies(editionId, {
      db,
      verify: verify({
        ...baseVerification,
        state: "drift",
        issueCount: 1,
        issues: [{ code: "unmatched_country", country: "Oland" }],
      }),
      now: () => new Date("2026-10-19T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      state: "drift",
      reason: "drift_age_unavailable",
      oldestDriftAgeSeconds: null,
    });
  });

  it("fails closed if a future verifier ever returns more issues than the canonical diagnostic bound", async () => {
    const issues = Array.from({ length: V3_ENTRY_PROJECTION_LAG_MAX_ISSUES + 1 }, (_, index) => ({
      code: "entry_artist" as const,
      submissionId: `submission-${index}`,
    }));
    const db = new ReadOnlyDatabase({ submissions: [], entries: [] });
    const result = await measureConfirmationEntryProjectionLagWithDependencies(editionId, {
      db,
      verify: verify({
        ...baseVerification,
        state: "drift",
        issueCount: issues.length,
        issues,
      }),
      now: () => new Date("2026-10-19T12:00:00.000Z"),
    });

    expect(result).toMatchObject({
      state: "unknown",
      reason: "issue_bound_exceeded",
      oldestDriftAgeSeconds: null,
    });
    expect(db.reads).toEqual([]);
  });
});

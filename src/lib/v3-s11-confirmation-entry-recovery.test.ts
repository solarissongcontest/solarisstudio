import { describe, expect, it } from "vitest";
import {
  reconcileConfirmationEditionToSolarisWithDependencies,
  verifyConfirmationEditionProjectionWithDatabase,
} from "@/integrations/confirmations/reconcile.server";

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private orders: Array<{ field: string; ascending: boolean }> = [];
  private rangeStart = 0;
  private rangeEnd: number | null = null;
  private exactCount = false;

  constructor(
    private readonly rows: Row[],
  ) {}

  select(_columns: string, options?: { count?: string }) {
    this.exactCount = options?.count === "exact";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  is(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field: string, values: readonly unknown[]) {
    const allowed = new Set(values);
    this.filters.push((row) => allowed.has(row[field]));
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: options?.ascending !== false });
    return this;
  }

  range(start: number, end: number) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  async maybeSingle() {
    const result = this.execute();
    return { data: result.data[0] ?? null, error: null };
  }

  then(resolve: any, reject: any) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  private execute() {
    let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    const count = this.exactCount ? data.length : null;

    if (this.orders.length) {
      data = [...data].sort((left, right) => {
        for (const { field, ascending } of this.orders) {
          const leftValue = left[field] ?? "";
          const rightValue = right[field] ?? "";
          if (leftValue === rightValue) continue;
          const comparison = String(leftValue).localeCompare(String(rightValue));
          return ascending ? comparison : -comparison;
        }
        return 0;
      });
    }

    if (this.rangeEnd !== null) {
      data = data.slice(this.rangeStart, this.rangeEnd + 1);
    }

    return { data, count, error: null };
  }
}

class FakeDatabase {
  constructor(private readonly tables: Tables) {}

  from(table: string) {
    const rows = this.tables[table];
    if (!rows) throw new Error(`Unexpected table read: ${table}`);
    return new FakeQuery(rows);
  }
}

describe("System V3 S11 Confirmation-owned Entry recovery", () => {
  it("detects stale projection, survives a failed repair, retries, then independently verifies consistency", async () => {
    const editionId = "11111111-1111-4111-8111-111111111111";
    const submissionId = "22222222-2222-4222-8222-222222222222";
    const countryId = "33333333-3333-4333-8333-333333333333";

    const tables: Tables = {
      editions: [{ id: editionId }],
      submissions: [
        {
          id: submissionId,
          edition_id: editionId,
          country: "Oland",
          participating: true,
          selection_method: "internal",
          updated_at: "2026-10-18T08:00:00.000Z",
        },
      ],
      countries: [{ id: countryId, name: "Oland" }],
      entries: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          edition_id: editionId,
          country_id: countryId,
          source: "confirmations",
          source_ref: submissionId,
          status: "confirmed",
          artist: "Stale Artist",
          song_title: "Canonical Song",
          song_url: "https://example.test/song",
          metadata: { confirmation_submission_id: submissionId },
          updated_at: "2026-10-18T08:00:00.000Z",
        },
      ],
      participants: [
        {
          id: "55555555-5555-4555-8555-555555555555",
          edition_id: editionId,
          show_id: null,
          country_id: countryId,
          participation_status: "confirmed",
          artist: "Stale Artist",
          song: "Canonical Song",
        },
      ],
      internal_entries: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          submission_id: submissionId,
          artist: "Canonical Artist",
          song_title: "Canonical Song",
          song_url: "https://example.test/song",
          review_status: "accepted",
        },
      ],
      national_finals: [],
      national_final_entries: [],
    };
    const db = new FakeDatabase(tables);

    const before = await verifyConfirmationEditionProjectionWithDatabase(editionId, db);
    expect(before.state).toBe("drift");
    expect(before.issues.map((issue) => issue.code).sort()).toEqual([
      "entry_artist",
      "participant_artist",
    ]);

    let attempts = 0;
    const syncSubmission = (async (id: string) => {
      expect(id).toBe(submissionId);
      attempts += 1;
      if (attempts === 1) throw new Error("injected transient sync failure");

      tables.entries[0].artist = "Canonical Artist";
      tables.participants[0].artist = "Canonical Artist";
      return { ok: true, status: "synced" } as any;
    }) as any;

    const firstRepair = await reconcileConfirmationEditionToSolarisWithDependencies(
      editionId,
      { offset: 0, limit: 1 },
      { db, syncSubmission },
    );
    expect(firstRepair).toMatchObject({
      processed: 1,
      succeeded: 0,
      failed: 1,
      complete: true,
    });
    expect(firstRepair.outcomes[0]).toMatchObject({
      submissionId,
      ok: false,
      status: "failed",
    });
    expect(firstRepair.outcomes[0].message).toContain("injected transient sync failure");

    // Traversal completion is not recovery certification. The independent
    // verifier must remain red after a failed repair attempt.
    const afterFailure = await verifyConfirmationEditionProjectionWithDatabase(editionId, db);
    expect(afterFailure.state).toBe("drift");
    expect(afterFailure.issueCount).toBe(2);

    const retryRepair = await reconcileConfirmationEditionToSolarisWithDependencies(
      editionId,
      { offset: 0, limit: 1 },
      { db, syncSubmission },
    );
    expect(retryRepair).toMatchObject({
      processed: 1,
      succeeded: 1,
      failed: 0,
      complete: true,
    });
    expect(attempts).toBe(2);

    // FakeDatabase exposes reads only, so this also proves the verifier cannot
    // silently repair while checking the result.
    const afterRetry = await verifyConfirmationEditionProjectionWithDatabase(editionId, db);
    expect(afterRetry).toMatchObject({
      state: "consistent",
      reason: "verified",
      issueCount: 0,
      totalSubmissions: 1,
      latestCountrySubmissions: 1,
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  V3_CONFIRMATION_RECONCILIATION_VERIFY_MAX_ROWS,
  reconcileConfirmationEditionToSolarisWithDependencies,
  verifyConfirmationEditionProjectionWithDatabase,
} from "@/integrations/confirmations/reconcile.server";

type Row = Record<string, any>;

class Query {
  private filters: Array<(row: Row) => boolean> = [];
  private orders: Array<{ field: string; ascending: boolean }> = [];
  private start = 0;
  private end: number | null = null;
  private exactCount = false;

  constructor(private readonly rows: Row[]) {}

  select(_columns: string, options?: { count?: string }) {
    this.exactCount = options?.count === "exact";
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: options?.ascending !== false });
    return this;
  }

  range(start: number, end: number) {
    this.start = start;
    this.end = end;
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
          const a = String(left[field] ?? "");
          const b = String(right[field] ?? "");
          if (a === b) continue;
          const compared = a.localeCompare(b);
          return ascending ? compared : -compared;
        }
        return 0;
      });
    }

    if (this.end !== null) data = data.slice(this.start, this.end + 1);
    return { data, count, error: null };
  }
}

class ReadOnlyDatabase {
  constructor(private readonly tables: Record<string, Row[]>) {}

  from(table: string) {
    const rows = this.tables[table];
    if (!rows) throw new Error(`Unexpected table read: ${table}`);
    return new Query(rows);
  }
}

const editionId = "11111111-1111-4111-8111-111111111111";

function submission(index: number) {
  const suffix = String(index + 1).padStart(12, "0");
  return {
    id: `22222222-2222-4222-8222-${suffix}`,
    edition_id: editionId,
    country: `Country ${index + 1}`,
    participating: true,
    selection_method: "internal",
    updated_at: `2026-10-18T08:${String(index).padStart(2, "0")}:00.000Z`,
  };
}

describe("System V3 S11 Entry recovery bounds", () => {
  it("requires explicit continuation across bounded repair pages", async () => {
    const rows = [submission(0), submission(1), submission(2)];
    const db = new ReadOnlyDatabase({ editions: [{ id: editionId }], submissions: rows });
    const synced: string[] = [];
    const syncSubmission = (async (id: string) => {
      synced.push(id);
      return { ok: true, status: "synced" } as any;
    }) as any;

    const first = await reconcileConfirmationEditionToSolarisWithDependencies(
      editionId,
      { offset: 0, limit: 2 },
      { db, syncSubmission },
    );

    expect(first).toMatchObject({
      totalSubmissions: 3,
      processed: 2,
      succeeded: 2,
      failed: 0,
      nextOffset: 2,
      complete: false,
    });
    expect(synced).toEqual([rows[0].id, rows[1].id]);

    const second = await reconcileConfirmationEditionToSolarisWithDependencies(
      editionId,
      { offset: first.nextOffset ?? 0, limit: 2 },
      { db, syncSubmission },
    );

    expect(second).toMatchObject({
      offset: 2,
      totalSubmissions: 3,
      processed: 1,
      succeeded: 1,
      failed: 0,
      nextOffset: null,
      complete: true,
    });
    expect(synced).toEqual(rows.map((row) => row.id));
  });

  it("refuses to pretend verification succeeded above the 500-row diagnostic ceiling", async () => {
    const rows = Array.from(
      { length: V3_CONFIRMATION_RECONCILIATION_VERIFY_MAX_ROWS + 1 },
      (_, index) => submission(index),
    );
    const db = new ReadOnlyDatabase({ editions: [{ id: editionId }], submissions: rows });

    const result = await verifyConfirmationEditionProjectionWithDatabase(editionId, db);

    expect(result).toMatchObject({
      state: "unknown",
      reason: "verification_bound_exceeded",
      totalSubmissions: V3_CONFIRMATION_RECONCILIATION_VERIFY_MAX_ROWS + 1,
      latestCountrySubmissions: 0,
      issueCount: 0,
      issues: [],
    });
  });

  it("rejects repair batches larger than the canonical 50-row ceiling before database traversal", async () => {
    const db = new ReadOnlyDatabase({ editions: [{ id: editionId }], submissions: [] });
    const syncSubmission = (async () => ({ ok: true, status: "synced" })) as any;

    await expect(
      reconcileConfirmationEditionToSolarisWithDependencies(
        editionId,
        { limit: 51 },
        { db, syncSubmission },
      ),
    ).rejects.toThrow("Expected integer between 1 and 50.");
  });
});

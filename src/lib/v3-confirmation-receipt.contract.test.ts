import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = () =>
  read("supabase/migrations/20261012013000_v3_confirmation_receipt_lookup.sql");
const functions = () => read("src/lib/v3-confirmation.functions.ts");
const wrapper = () => read("src/components/ConfirmationFormWithReceipt.tsx");
const store = () => read("src/lib/v3-confirmation-receipt-store.ts");

describe("V3 Confirmation authoritative receipt presentation", () => {
  it("looks up receipts only by exact accepted submission context", () => {
    const sql = migration();

    expect(sql).toContain("operation.round_id = _round_id");
    expect(sql).toContain("operation.browser_session_id = _browser_session_id");
    expect(sql).toContain("operation.result ->> 'submission_id' = _submission_id::text");
    expect(sql).toContain("order by operation.accepted_at desc");
    expect(sql).not.toContain("operation.result ||");
  });

  it("returns receipt metadata without exposing the private operation result", () => {
    const sql = migration();

    expect(sql).toContain("'receipt_id', v_operation.receipt_id");
    expect(sql).toContain("'idempotency_key', v_operation.idempotency_key");
    expect(sql).toContain("'request_hash', v_operation.request_hash");
    expect(sql).not.toContain("'result', v_operation.result");
  });

  it("validates the browser receipt lookup on the server adapter", () => {
    const source = functions();

    expect(source).toContain("const receiptLookupSchema = z.object({");
    expect(source).toContain("export const lookupV3ConfirmationReceipt");
    expect(source).toContain('"v3_lookup_confirmation_receipt"');
    expect(source).toContain("receipt.roundId !== data.round_id");
  });

  it("shows checking status before claiming the authoritative receipt exists", () => {
    const source = wrapper();

    expect(source).toContain('setReceiptStage("checking")');
    expect(source).toContain("Checking submission status");
    expect(source).toContain("Do not submit it again while this check is running.");
    expect(source).toContain('setReceiptStage("confirmed")');
    expect(source).toContain("The server receipt ledger confirms this exact submission.");
  });

  it("persists only validated authoritative receipts for later route recovery", () => {
    const source = store();

    expect(source).toContain('value.receipt?.authority === "authoritative_server"');
    expect(source).toContain("value.receipt.roundId === roundId");
    expect(source).toContain("writeStoredV3ConfirmationReceipt");
    expect(source).not.toContain("sessionStorage");
  });
});

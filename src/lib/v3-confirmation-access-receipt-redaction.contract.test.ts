import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261020002600_confirmation_access_receipt_redaction.sql",
  ),
  "utf8",
);

describe("V3 Confirmation access receipt privacy", () => {
  it("removes private admin-note text from persisted operation scope", () => {
    expect(migration).toContain("new.command = 'confirmation.response.access.update'");
    expect(migration).toContain("new.scope, '{}'::jsonb) ? 'adminNotes'");
    expect(migration).toContain("coalesce(new.scope, '{}'::jsonb) - 'adminNotes'");
    expect(migration).toContain("'adminNotesPresent'");
  });

  it("redacts before operation-receipt insert/update without weakening the separate request fingerprint", () => {
    expect(migration).toContain("before insert or update of scope, command");
    expect(migration).toContain("on public.studio2_operation_receipts");
    expect(migration).toContain("request_fingerprint is computed from the semantic request before insert");
    expect(migration).not.toContain("update public.studio2_operation_receipts set request_fingerprint");
  });
});

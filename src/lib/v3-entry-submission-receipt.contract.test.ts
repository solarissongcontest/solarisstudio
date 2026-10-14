import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
const migration = () => source("supabase/migrations/20261014060000_v3_entry_submission_receipt.sql");
const entrySource = () => source("src/integrations/v3/entry-source.server.ts");
const entryActions = () => source("src/integrations/v3/entry-actions.server.ts");
const actionBoundary = () => source("src/lib/v3-entry.actions.ts");
const screen = () => source("src/components/v3/V3EntryScreen.tsx");

describe("V3 Entry submission receipt and edit continuity", () => {
  it("projects receipt evidence only after authenticated country-account scope is proven", () => {
    const sql = migration();
    expect(sql).toContain("auth.uid() is null");
    expect(sql).toContain("public.public_country_account_confirmation_access()");
    expect(sql).toContain("private.v3_confirmation_operations");
    expect(sql).toContain("operation.result ->> 'submission_id' = p_submission_id::text");
    expect(sql).toContain("operation.round_id::text = v_response ->> 'round_id'");
    expect(sql).toContain("revoke all on function public.v3_country_account_entry_receipt(uuid)");
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("to authenticated, service_role");
    expect(sql).not.toContain("grant select on private.v3_confirmation_operations");
  });

  it("never fabricates a V3 receipt for canonical submissions without ledger evidence", () => {
    const sql = migration();
    expect(sql).toContain("if not found then");
    expect(sql).toContain("'found', false");
    expect(sql).not.toContain("clock_timestamp()");
    expect(screen()).toContain('data-v3-entry-receipt="legacy-unavailable"');
    expect(screen()).toContain("does not manufacture one from browser or device timestamps");
  });

  it("keeps receipt lookup server-owned and bounded to the already selected canonical response", () => {
    const code = entrySource();
    expect(code).toContain('client.rpc("v3_country_account_entry_receipt"');
    expect(code).toContain("p_submission_id: submissionId");
    expect(code).toContain("mapSubmissionReceipt");
    expect(code).not.toContain('.from("v3_confirmation_operations")');
    expect(code).not.toContain('.from("participants")');
  });

  it("opens editing through the existing canonical Confirmation edit-token authority", () => {
    const server = entryActions();
    const boundary = actionBoundary();
    expect(boundary).toContain("z.object({}).strict()");
    expect(boundary).not.toMatch(/countryId|editionId|roundId|submissionId|userId/);
    expect(server).toContain("getSolarisAccessTokenServer");
    expect(server).toContain('client.rpc("public_country_account_confirmation_access")');
    expect(server).toContain('client.rpc("public_create_country_account_edit_token"');
    expect(server).toContain("resolveCurrentPublicEdition");
    expect(server).not.toContain("v3_submit_confirmation");
    expect(server).not.toContain('.from("submissions")');
  });

  it("keeps the V3 Entry screen free of direct Supabase mutation ownership", () => {
    const code = screen();
    expect(code).toContain("useServerFn(openCurrentV3EntryEditor)");
    expect(code).toContain('data-v3-entry-receipt="authoritative"');
    expect(code).toContain("Submission receipts remain owned by Confirmation");
    expect(code).not.toContain("supabase");
    expect(code).not.toContain("submitV3Confirmation");
    expect(code).not.toContain("createCountryAccountConfirmationEditToken");
  });
});

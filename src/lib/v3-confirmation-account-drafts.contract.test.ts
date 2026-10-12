import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = () =>
  read("supabase/migrations/20261012012000_v3_confirmation_account_drafts.sql");
const accountClient = () => read("src/lib/confirmation-country-account.ts");
const bridge = () => read("src/components/ConfirmationFormWithReceipt.tsx");
const session = () => read("src/lib/session.ts");

describe("V3 Confirmation signed-in draft continuity", () => {
  it("keys account drafts by canonical country identity instead of browser identity", () => {
    const sql = migration();

    expect(sql).toContain("primary key (round_id, country_id)");
    expect(sql).toContain("where account.user_id = auth.uid()");
    expect(sql).toContain("and account.status = 'active'");
    expect(sql).not.toContain("browser_session_id");
  });

  it("keeps account draft storage private and exposes only authenticated RPCs", () => {
    const sql = migration();

    expect(sql).toContain(
      "revoke all on table private.v3_confirmation_account_drafts\n  from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.v3_load_account_confirmation_draft(uuid)\n  to authenticated, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.v3_save_account_confirmation_draft(uuid, jsonb, bigint)\n  to authenticated, service_role",
    );
    expect(sql).toContain(
      "grant execute on function public.v3_delete_account_confirmation_draft(uuid)\n  to authenticated, service_role",
    );
  });

  it("uses compare-and-swap revisions and returns the canonical server copy on conflict", () => {
    const sql = migration();

    expect(sql).toContain("for update");
    expect(sql).toContain("v_existing.revision <> v_expected");
    expect(sql).toContain("'conflict', true");
    expect(sql).toContain("'payload', v_existing.payload");
    expect(sql).toContain("revision = draft.revision + 1");
  });

  it("calls account draft RPCs through the signed-in browser client", () => {
    const source = accountClient();

    expect(source).toContain('confirmations.rpc(\n    "v3_load_account_confirmation_draft"');
    expect(source).toContain('confirmations.rpc(\n    "v3_save_account_confirmation_draft"');
    expect(source).toContain('confirmations.rpc(\n    "v3_delete_account_confirmation_draft"');
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("emits same-document draft events because storage events do not fire in the writer tab", () => {
    const source = session();

    expect(source).toContain(
      'CONFIRMATION_DRAFT_SAVED_EVENT = "solaris:confirmation-draft-saved"',
    );
    expect(source).toContain("new CustomEvent<ConfirmationDraftSavedDetail<T>>");
    expect(source).toContain("detail: { roundId, payload, step, savedAt }");
  });

  it("bridges the legacy form to account drafts without silently overwriting cross-device conflicts", () => {
    const source = bridge();

    expect(source).toContain("loadCountryAccountConfirmationDraft(roundId)");
    expect(source).toContain("saveCountryAccountConfirmationDraft({");
    expect(source).toContain('setBridgeMode("conflict")');
    expect(source).toContain("Nothing will be overwritten until you choose.");
    expect(source).toContain("expectedRevision: bridgeConflict.account.revision");
    expect(source).toContain("accountRevision.current = result.revision");
  });

  it("clears the cross-device draft after the official submission receipt event", () => {
    const source = bridge();

    expect(source).toContain("deleteCountryAccountConfirmationDraft(roundId)");
    expect(source).toContain("CONFIRMATION_SUBMITTED_EVENT");
  });
});

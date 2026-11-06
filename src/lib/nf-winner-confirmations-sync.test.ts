import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("My Solaris National Final winner authority", () => {
  it("lets the country results editor set and clear a winner", () => {
    const editor = source("src/components/NationalFinalResultOrderAddon.tsx");

    expect(editor).toContain("useSetCountryNationalFinalWinner");
    expect(editor).toContain("Set winner");
    expect(editor).toContain("Clear winner");
    expect(editor).toContain("Save result & winner");
    expect(editor).toContain("original Confirmations response");
  });

  it("routes Confirmation-backed winners through the canonical exact-version Selection operation", () => {
    const data = source("src/lib/historical-national-finals.ts");

    expect(data).toContain('input.source !== "confirmation"');
    expect(data).toContain('rpc("set_country_national_final_winner"');
    expect(data).toContain('rpc("studio2_confirmation_winner_change_preview"');
    expect(data).toContain('rpc("studio2_apply_confirmation_winner_change"');
    expect(data).toContain("p_expected_version: preview.expectedVersion");
    expect(data).toContain("p_expected_entry_version:");
    expect(data).toContain("preview.alreadyApplied === true");
    expect(data).toContain("crypto.randomUUID()");
    expect(data).not.toContain("confirmationsSupabase");
    expect(data).not.toContain("set_confirmation_national_final_winner_from_solaris");
    expect(data).not.toContain("Winner rollback failed");
  });

  it("keeps manual/historical winner editing separate from Confirmation authority", () => {
    const cutover = source(
      "supabase/migrations/20261018084600_v3_selection_country_winner_cutover.sql",
    );

    expect(cutover).toContain("private.v3_country_account_owns_confirmation_nf");
    expect(cutover).toContain("studio2_confirmation_winner_change_preview");
    expect(cutover).toContain("set_country_national_final_winner");
    expect(cutover).toContain("v_nf.submission_id is not null");
    expect(cutover).toContain("v_nf.source is distinct from 'manual'");
    expect(cutover).toContain(
      "Confirmation-backed National Final winners must use the canonical Selection operation",
    );
  });

  it("retires the former same-database sync writer as an executable bypass", () => {
    const cutover = source(
      "supabase/migrations/20261018084600_v3_selection_country_winner_cutover.sql",
    );
    const compatibilityClient = source("src/integrations/confirmations/client.ts");

    expect(compatibilityClient).toContain("Confirmations now lives on Solaris Studio's canonical Supabase project");
    expect(cutover).toContain(
      "revoke all on function public.set_confirmation_national_final_winner_from_solaris(uuid, uuid)",
    );
    expect(cutover).toContain("from public, anon, authenticated, service_role");
    expect(cutover).toContain("Legacy Confirmation winner sync writer remains executable");
  });
});

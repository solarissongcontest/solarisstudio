import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("My Solaris National Final winner sync", () => {
  it("lets the country results editor set and clear a winner", () => {
    const editor = source("src/components/NationalFinalResultOrderAddon.tsx");

    expect(editor).toContain("useSetCountryNationalFinalWinner");
    expect(editor).toContain("Set winner");
    expect(editor).toContain("Clear winner");
    expect(editor).toContain("Save result & winner");
    expect(editor).toContain("original Confirmations response");
  });

  it("writes the exact winner UUID to Solaris and Confirmations", () => {
    const data = source("src/lib/historical-national-finals.ts");

    expect(data).toContain("set_country_national_final_winner");
    expect(data).toContain("set_confirmation_national_final_winner_from_solaris");
    expect(data).toContain("previousWinnerEntryId");
    expect(data).toContain('input.source === "confirmation"');
  });

  it("keeps both database migrations source controlled", () => {
    const solarisMigration = source("supabase/migrations/20260823031000_country_nf_winner_editing.sql");
    const confirmationMigration = source("scripts/confirmations-country-nf-winner-sync.sql");

    expect(solarisMigration).toContain("set_country_national_final_winner");
    expect(solarisMigration).toContain("can_manage_country_national_finals");
    expect(confirmationMigration).toContain("set_confirmation_national_final_winner_from_solaris");
    expect(confirmationMigration).toContain("can_solaris_manage_confirmation_national_final");
    expect(confirmationMigration).toContain("Winner synced from My Solaris");
  });
});

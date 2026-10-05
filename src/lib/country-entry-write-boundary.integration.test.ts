import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const hardening = source(
  "supabase/migrations/20261004220000_harden_country_entry_direct_writes.sql",
);
const ownedEntry = source(
  "supabase/migrations/20260819215500_clean_edition_entry_rpcs.sql",
);
const listenLinks = source(
  "supabase/migrations/20260819214500_entry_listening_links_and_country_personalities.sql",
);
const publication = source(
  "supabase/migrations/20260821170000_beta2_entry_reveals_and_national_final_history.sql",
);

function policyBlock(policyName: string) {
  const start = hardening.indexOf(`create policy "${policyName}"`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = hardening.indexOf("create policy", start + 1);
  return hardening.slice(start, next === -1 ? hardening.length : next);
}

describe("country account canonical entry write boundary", () => {
  it("removes delegation ownership from direct canonical entry writes", () => {
    for (const policy of [
      "entries capability write insert",
      "entries capability write update",
      "entries capability write delete",
      "participants capability write insert",
      "participants capability write update",
      "participants capability write delete",
    ]) {
      const block = policyBlock(policy);
      expect(block).toContain("studio2_access_allowed('entry.edit'");
      expect(block).not.toContain("country_accounts");
      expect(block).not.toContain("owns_country");
      expect(block).not.toContain("auth.uid()");
    }
  });

  it("keeps participant-facing writes behind narrow server-authorized RPCs", () => {
    expect(ownedEntry).toContain("function public.upsert_owned_country_edition_entry");
    expect(listenLinks).toContain("function public.update_owned_country_entry_listen_links");
    expect(publication).toContain("function public.set_owned_country_entry_publication");
  });
});

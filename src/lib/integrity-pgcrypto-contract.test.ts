import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const core = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910213000_integrity_core.sql"),
  "utf8",
);
const reporting = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260910213100_integrity_reporting_and_review.sql",
  ),
  "utf8",
);

describe("integrity cryptography migration order", () => {
  it("installs pgcrypto before anonymous case functions depend on it", () => {
    expect(core).toContain(
      "create extension if not exists pgcrypto with schema extensions",
    );
    expect(core).toContain("alter extension pgcrypto set schema extensions");
    expect(reporting).toContain("extensions.gen_random_bytes");
    expect(reporting).toContain("extensions.digest");
  });

  it("keeps the core crypto setup transaction-scoped", () => {
    expect(core.trimStart()).toMatch(/^begin;/i);
    expect(core.trimEnd()).toMatch(/commit;$/i);
  });
});

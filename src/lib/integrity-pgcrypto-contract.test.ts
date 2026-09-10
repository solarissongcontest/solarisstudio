import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const prerequisite = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260910211400_integrity_pgcrypto_prerequisite.sql",
  ),
  "utf8",
);

const caseMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260910211500_integrity_case_center.sql",
  ),
  "utf8",
);

describe("integrity cryptography migration order", () => {
  it("installs pgcrypto before anonymous case functions depend on it", () => {
    expect(prerequisite).toContain(
      "create extension if not exists pgcrypto with schema extensions",
    );
    expect(prerequisite).toContain("alter extension pgcrypto set schema extensions");
    expect(caseMigration).toContain("extensions.gen_random_bytes");
    expect(caseMigration).toContain("extensions.digest");
  });

  it("keeps the crypto prerequisite transaction-scoped", () => {
    expect(prerequisite.trimStart()).toMatch(/^begin;/i);
    expect(prerequisite.trimEnd()).toMatch(/commit;$/i);
  });
});

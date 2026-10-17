import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = () =>
  readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20261017212902_confirmation_round_response_integrity.sql",
    ),
    "utf8",
  );

describe("Confirmation round response integrity", () => {
  it("prevents deleting a round from cascading into its responses", () => {
    const sql = migration().toLowerCase();

    expect(sql).toContain("foreign key (round_id)");
    expect(sql).toContain("references public.submission_rounds(id)");
    expect(sql).toContain("on delete restrict");
    expect(sql).not.toContain("on delete cascade");
  });
});

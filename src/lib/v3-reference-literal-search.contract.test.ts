import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261104110000_v3_reference_literal_search.sql",
  "utf8",
);
const rpc = migration.split(
  "create or replace function public.solaris_public_search(",
)[1]?.split("$$;")[0] ?? "";

describe("V3 Reference literal public-search regression", () => {
  it("retains the existing callable public-search contract", () => {
    expect(rpc).toContain("search_query text");
    expect(rpc).toContain("result_limit integer default 30");
    expect(rpc).toContain("security invoker");
    expect(rpc).toContain("stable");
    expect(rpc).toContain("public.public_safe_participants(null, null)");
  });

  it("treats wildcard-looking user terms as literal substrings", () => {
    expect(rpc).toContain("position(input.term in items.keywords) > 0");
    expect(rpc).toContain("position(' ' || input.term in items.keywords) > 0");
    expect(rpc).not.toMatch(/\blike\s+(?:'|input\.term)/i);
    expect(rpc).not.toContain("items.keywords like");
    expect("country_% song".includes("%")).toBe(true);
    expect("country song".includes("%")).toBe(false);
    expect("country song".includes("_")).toBe(false);
  });

  it("preserves the exact-title and literal prefix ordering", () => {
    expect(rpc).toContain("when lower(items.title) = input.term then 0");
    expect(rpc).toContain(
      "when left(lower(items.title), char_length(input.term)) = input.term then 10",
    );
  });

  it("rejects one-character and overlong user searches before matching", () => {
    expect(rpc).toContain("lower(trim(coalesce(search_query, '')))");
    expect(rpc).toContain("char_length(input.term) between 2 and 120");
  });

  it("retains a bounded result set and published edition/show gates", () => {
    expect(rpc).toContain("limit least(greatest(coalesce(result_limit, 30), 1), 50)");
    expect(rpc).toContain("coalesce(s.published, false)");
    expect(rpc).toContain("coalesce(e.published, false)");
  });

  it("preserves the anonymous and authenticated grants without public execution", () => {
    expect(migration).toContain(
      "revoke all on function public.solaris_public_search(text, integer) from public",
    );
    expect(migration).toContain(
      "grant execute on function public.solaris_public_search(text, integer) to anon, authenticated",
    );
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});

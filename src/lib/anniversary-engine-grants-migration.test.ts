import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260916193600_anniversary_engine_grants_guard.sql"),
  "utf8",
);

describe("anniversary engine grants guard", () => {
  it("keeps the public anniversary RPC callable by public app roles", () => {
    expect(migration).toContain(
      "grant execute on function public.studio2_anniversary_engine(date, integer) to anon, authenticated, service_role;",
    );
  });
});

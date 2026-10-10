import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("country-auth Edge deployment contract", () => {
  it("allows anonymous gateway entry while protecting authenticated actions inside the function", () => {
    const config = source("supabase/config.toml");
    const authFunction = source("supabase/functions/country-auth/index.ts");

    expect(config).toMatch(/\[functions\.country-auth\]\s+verify_jwt = false/);
    expect(authFunction).toContain("async function currentUser()");

    for (const action of ["profile", "set-email", "set-password"]) {
      const start = authFunction.indexOf(`if (action === "${action}")`);
      expect(start).toBeGreaterThan(-1);
      const next = authFunction.indexOf('\n  if (action === "', start + 1);
      const block = authFunction.slice(start, next === -1 ? undefined : next);
      expect(block).toContain("await currentUser()");
      expect(block).toContain("if (!user)");
    }
  });
});

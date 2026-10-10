import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const authFunction = source("supabase/functions/country-auth/index.ts");
const migration = source(
  "supabase/migrations/20261004224000_country_auth_rate_limits.sql",
);

describe("country-auth anonymous rate-limit hardening", () => {
  it("layers address and target buckets so rotating identifiers cannot bypass the limiter", () => {
    expect(authFunction).toContain("async function consumeAnonymousRateLimit");
    expect(authFunction).toContain("`${scope}:address`");
    expect(authFunction).toContain("`${scope}:target`");
    expect(authFunction).toContain(
      '"signup",\n        clientAddress,\n        `${countryId}|${instagramUsername}`,\n        5,\n        20,',
    );
    expect(authFunction).toContain(
      '"signin",\n        clientAddress,\n        identifier,\n        20,\n        60,',
    );
    expect(authFunction).toContain(
      '"recover",\n        clientAddress,\n        identifier,\n        5,\n        15,',
    );
  });

  it("keeps hashed limiter state bounded instead of retaining stale identifier churn forever", () => {
    expect(migration).toContain("country_auth_rate_limits_updated_idx");
    expect(migration).toContain("candidate.updated_at < v_now - interval '2 days'");
    expect(migration).toContain("limit 200");
    expect(migration).toContain("revoke all on private.country_auth_rate_limits");
  });
});
